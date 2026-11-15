// Supabase Edge Function: tg-auth
// Проверяет Telegram initData и выдаёт настоящую Supabase-сессию.
// Секреты (supabase secrets set): TELEGRAM_BOT_TOKEN, ALLOWED_ORIGINS
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const enc = new TextEncoder();

async function hmac(key: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

const hex = (b: Uint8Array) =>
  Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function cors(origin: string) {
  const ok = ALLOWED.length
    ? ALLOWED.includes(origin)
    : origin.endsWith('.github.io') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

Deno.serve(async (req) => {
  const headers = cors(req.headers.get('origin') ?? '');
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, headers);

  let initData = '';
  try {
    initData = (await req.json())?.initData ?? '';
  } catch {
    return json({ error: 'bad json' }, 400, headers);
  }
  if (!initData) return json({ error: 'no initData' }, 401, headers);

  // 1. Проверка подписи initData
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return json({ error: 'no hash' }, 401, headers);
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = await hmac(enc.encode('WebAppData'), BOT_TOKEN);
  const expected = hex(await hmac(secret, checkString));
  if (!safeEqual(expected, hash)) return json({ error: 'bad signature' }, 401, headers);

  // 2. Свежесть и владелец
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 3600) {
    return json({ error: 'initData expired' }, 401, headers);
  }

  let tgUser: { id?: number } | null = null;
  try {
    tgUser = JSON.parse(params.get('user') ?? 'null');
  } catch { /* ignore */ }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: cfg, error: cfgErr } = await admin
    .from('app_config')
    .select('owner_telegram_id, owner_email')
    .eq('id', 1)
    .single();

  if (cfgErr || !cfg) return json({ error: 'app_config not set' }, 500, headers);
  if (Number(tgUser?.id) !== Number(cfg.owner_telegram_id)) {
    return json({ error: 'forbidden' }, 403, headers);
  }

  // 3. Сессия: magic-link токен → обычная сессия
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: cfg.owner_email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    return json({ error: linkErr?.message ?? 'link failed' }, 500, headers);
  }

  const verify = await fetch(
    `${SUPABASE_URL}/auth/v1/verify?token_hash=${link.properties.hashed_token}&type=magiclink`,
    { headers: { apikey: ANON_KEY } },
  );
  const session = await verify.json();
  if (!verify.ok || !session.access_token) {
    return json({ error: session.error_description ?? session.msg ?? 'verify failed' }, 500, headers);
  }

  return json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    token_type: session.token_type,
  }, 200, headers);
});
