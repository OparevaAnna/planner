import { supabase, missingConfig } from './supabase';

// ---------- Telegram ----------
export let tg = null;

export async function initTelegram() {
  try {
    const mod = await import('@twa-dev/sdk');
    tg = mod.default;
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#0f1115');
    tg.disableVerticalSwipes?.();
  } catch {
    tg = window.Telegram?.WebApp ?? null;
  }
  applyTheme();
  return tg;
}

function applyTheme() {
  const p = tg?.themeParams ?? {};
  const root = document.documentElement;
  const map = {
    '--bg': p.bg_color,
    '--fg': p.text_color,
    '--muted': p.hint_color,
    '--card': p.secondary_bg_color,
    '--card2': p.secondary_bg_color,
    '--line': p.section_separator_color,
    '--accent': p.button_color ?? p.link_color,
  };
  for (const [k, v] of Object.entries(map)) if (v) root.style.setProperty(k, v);
  if (tg?.colorScheme === 'light' && !p.bg_color) {
    root.style.setProperty('--bg', '#f6f7f9');
    root.style.setProperty('--fg', '#111318');
  }
}

export const haptic = (type = 'light') => { try { tg?.HapticFeedback?.impactOccurred(type); } catch {} };
export const notify = (type = 'success') => { try { tg?.HapticFeedback?.notificationOccurred(type); } catch {} };

// ---------- auth ----------
const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL;

export async function ensureAuth() {
  if (!supabase) throw new Error(missingConfig ?? 'Supabase не настроен');
  const { data } = await supabase.auth.getSession();
  const fresh = data.session && (data.session.expires_at ?? 0) - Date.now() / 1000 > 300;
  if (fresh) return data.session;

  const initData = tg?.initData;
  if (!initData) throw new Error('Нет Telegram initData — открой приложение из бота');
  if (!FUNCTIONS_URL) throw new Error('VITE_FUNCTIONS_URL не задан');

  const res = await fetch(`${FUNCTIONS_URL}/tg-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) throw new Error(`Авторизация не удалась (${res.status})`);
  const s = await res.json();
  const { data: set, error } = await supabase.auth.setSession({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
  });
  if (error) throw error;
  return set.session;
}

// ---------- данные ----------
export const todayStr = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());

export function hhmm(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
}

export const clean = (t) => (t ? String(t).slice(0, 5) : '');

export async function loadDay(date) {
  const [plan, tasks, facts, open] = await Promise.all([
    supabase.from('daily_plans').select('*').eq('plan_date', date).maybeSingle(),
    supabase.from('daily_tasks').select('*').eq('plan_date', date).order('position'),
    supabase.from('fact_logs').select('*').eq('fact_date', date).order('started_at'),
    supabase.from('task_sessions').select('*').is('ended_at', null).maybeSingle(),
  ]);
  const err = plan.error || tasks.error || facts.error || open.error;
  if (err) throw err;
  return { plan: plan.data, tasks: tasks.data ?? [], facts: facts.data ?? [], open: open.data };
}

export function isoAt(date, timeStr) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName').value;
  const off = part.replace('GMT', '') || '+00:00';
  return new Date(`${date}T${timeStr}:00${off}`).toISOString();
}

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

export const startTask = (id) => rpc('start_task', { p_task_id: id });export const resumeTask = (id) => rpc('resume_task', { p_task_id: id });
export const pauseTask = (id, { reason, asFact, category }) =>
  rpc('pause_task', {
    p_task_id: id,
    p_reason: reason || null,
    p_as_fact: Boolean(asFact),
    p_fact_category: category || null,
  });
export const completeTask = (id, { comment, energy }) =>
  rpc('complete_task', {
    p_task_id: id,
    p_comment: comment || null,
    p_energy: energy || null,
  });
export const reopenTask = (id) => rpc('reopen_task', { p_task_id: id });

export async function patchTask(id, patch) {
  const { data, error } = await supabase
    .from('daily_tasks')
    .update({ ...patch, source: 'telegram' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Ручное время главнее таймера и плана.
 * Пишется в daily_tasks: started_at/completed_at + actual_minutes, time_source='fact'
 * (в отчёте это «вручную»). Время таймера остаётся в task_sessions как история.
 */
export async function setTaskTime(id, { start, end, comment, energy }) {
  const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
  if (!(minutes > 0)) throw new Error('Конец должен быть позже начала');
  const patch = { started_at: start, completed_at: end, actual_minutes: minutes, time_source: 'fact' };
  if (comment !== undefined) patch.comment = comment;
  if (energy) patch.energy = energy;
  return patchTask(id, patch);
}

export async function addFact({ date, title, category, start, end, comment }) {
  const { data, error } = await supabase.from('fact_logs').insert({
    fact_date: date,
    title,
    category,
    started_at: start,
    ended_at: end,
    comment: comment || null,
    source: 'telegram',
  }).select().single();
  if (error) throw error;
  return data;
}

// ---------- категории ----------
export const CATEGORIES = [
  { id: 'work', label: 'Работа', color: '#6366f1' },
  { id: 'study', label: 'Учёба', color: '#0891b2' },
  { id: 'sport', label: 'Спорт', color: '#16a34a' },
  { id: 'health', label: 'Здоровье', color: '#e11d48' },
  { id: 'home', label: 'Быт', color: '#a16207' },
  { id: 'family', label: 'Семья', color: '#db2777' },
  { id: 'friends', label: 'Друзья', color: '#7c3aed' },
  { id: 'rest', label: 'Отдых', color: '#0284c7' },
  { id: 'other', label: 'Прочее', color: '#64748b' },
];

export const catOf = (id) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export const MODES = {
  green: { icon: '🟢', label: 'зелёный' },
  yellow: { icon: '🟡', label: 'жёлтый' },
  red: { icon: '🔴', label: 'красный' },
};

export const minutesOf = (from, to = Date.now()) =>
  Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
