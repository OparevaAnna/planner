#!/usr/bin/env node
/**
 * tracker.mjs — мост между планировщиком и Supabase.
 *
 * Все команды печатают JSON в stdout (кроме --md).
 * Мутирующие команды по умолчанию в режиме «показать, что будет» (:dry-run),
 * запись — только с --apply / --dry-run=false.
 *
 * Быстрый старт: node tools/tracker.mjs doctor
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  TZ, today, tzOffset, toIso, toMin, hhmm, timeOf, dur,
  interval, gaps, pickGap, pad,
} from './lib/time.mjs';

// ---------- инфраструктура ----------
const die = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

let _sb = null;
function sb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) die('SUPABASE_URL не задан (.env)');
  if (!key) die('SUPABASE_SERVICE_ROLE_KEY не задан (.env)');
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags[name] = next; i++; }
    else flags[name] = true;
  }
  return flags;
}

const out = (obj) => console.log(JSON.stringify(obj, null, 2));

// ---------- выборки ----------
async function loadDay(date) {
  const { data: plan } = await sb().from('daily_plans').select('*').eq('plan_date', date).maybeSingle();
  const { data: tasks, error } = await sb().from('daily_tasks').select('*')
    .eq('plan_date', date).order('position');
  if (error) throw error;
  const ids = (tasks ?? []).map((t) => t.id);
  let sessions = [];
  if (ids.length) {
    const r = await sb().from('task_sessions').select('*').in('task_id', ids).order('started_at');
    if (r.error) throw r.error;
    sessions = r.data ?? [];
  }
  const f = await sb().from('fact_logs').select('*').eq('fact_date', date).order('started_at');
  if (f.error) throw f.error;
  const st = await sb().from('v_day_stats').select('*').eq('plan_date', date).maybeSingle();
  return { plan, tasks: tasks ?? [], sessions, facts: f.data ?? [], stats: st.data ?? null };
}

// ---------- markdown ----------
function renderDay(date, { plan, tasks, sessions, facts, stats }) {
  const L = [];
  const modeIcon = { green: '🟢', yellow: '🟡', red: '🔴' }[plan?.mode] ?? '—';
  L.push(`## ${date} · ${modeIcon}`);
  if (plan?.main_goal) L.push(`**Главная задача:** ${plan.main_goal}`);
  if (plan?.first_step) L.push(`**Первый шаг:** ${plan.first_step}`);
  L.push('');
  L.push('| План | Задача | Кат. | Факт | Статус | Комментарий |');
  L.push('|---|---|---|---|---|---|');
  for (const t of tasks) {
    const planStr = t.planned_time ? `${String(t.planned_time).slice(0, 5)}${t.planned_minutes ? ` (${t.planned_minutes}м)` : ''}` : '—';
    const factStr = t.actual_minutes != null
      ? `${t.actual_minutes}м${t.time_source === 'planned' ? ' (план)' : t.time_source === 'fact' ? ' (факт)' : ''}`
      : (t.started_at ? `${timeOf(t.started_at)}→?` : '—');
    const status = { planned: '·', active: '▶ идёт', paused: '⏸ пауза', done: '✓', skipped: '–' }[t.status] ?? t.status;
    L.push(`| ${planStr} | ${t.title} | ${t.category} | ${factStr} | ${status} | ${t.comment ?? ''} |`);
  }
  if (facts.length) {
    L.push('', '**Факты вне плана:**');
    for (const f of facts) {
      L.push(`- ${timeOf(f.started_at) || '?'}–${f.ended_at ? timeOf(f.ended_at) : '…'} · ${f.title} [${f.category}]${f.comment ? ` — ${f.comment}` : ''}`);
    }
  }
  const paused = sessions.filter((s) => s.pause_reason);
  if (paused.length) {
    L.push('', '**Паузы:**');
    for (const s of paused) L.push(`- ${timeOf(s.started_at)}–${s.ended_at ? timeOf(s.ended_at) : '…'} работа, затем: ${s.pause_reason}`);
  }
  if (stats) {
    L.push('', `**Итог:** ${stats.done_count}/${stats.planned_count} задач · ` +
      `трекинг ${dur(stats.tracked_minutes)} · план-импутация ${dur(stats.imputed_minutes)} · ` +
      `факты ${dur(stats.fact_minutes)}${stats.done_untracked ? ` · без замера: ${stats.done_untracked}` : ''}`);
  }
  return L.join('\n');
}

// ---------- команды ----------
const commands = {
  async doctor() {
    const date = today();
    const res = { today: date, tz: TZ, offset: tzOffset(date), url: process.env.SUPABASE_URL ?? null, key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) };
    try {
      const { count, error } = await sb().from('daily_tasks').select('id', { count: 'exact', head: true });
      if (error) throw error;
      res.daily_tasks = count;
      const cfg = await sb().from('app_config').select('owner_auth_id, owner_telegram_id, timezone').eq('id', 1).maybeSingle();
      res.config = cfg.data;
      if (cfg.data?.owner_auth_id?.startsWith('00000000')) res.warn = 'app_config содержит заглушку — подставь свой auth uuid и telegram id';
      const st = await sb().from('v_day_stats').select('*').eq('plan_date', date).maybeSingle();
      res.today_stats = st.data;
      res.ok = true;
    } catch (e) {
      res.ok = false;
      res.error = e.message;
      res.hint = 'проверь SUPABASE_URL / SERVICE_ROLE_KEY и что schema.sql выполнен';
    }
    out(res);
  },

  async 'plan:get'(flags) {
    const date = flags.date || today();
    const day = await loadDay(date);
    if (flags.md) return console.log(renderDay(date, day));
    out({ date, ...day });
  },

  async 'plan:push'(flags) {
    const apply = flags.apply === true || flags.apply === 'true';
    if (!flags.file) die('нужен --file tmp/plan.json');
    const payload = JSON.parse(readFileSync(flags.file, 'utf8'));
    const date = flags.date || payload.date;
    if (!date) die('нужна дата: --date YYYY-MM-DD или "date" в файле');
    const tasks = (payload.tasks ?? []).map((t, i) => ({
      plan_date: date,
      position: i,
      title: String(t.title).trim(),
      category: t.category ?? 'other',
      planned_time: t.time ?? t.planned_time ?? null,
      planned_minutes: t.minutes ?? t.planned_minutes ?? null,
      is_anchor: Boolean(t.anchor ?? t.is_anchor ?? false),
      source: 'opencode',
    })).filter((t) => t.title);

    const { data: existing } = await sb().from('daily_tasks').select('*').eq('plan_date', date);
    const touched = (existing ?? []).filter((t) => t.status !== 'planned' || t.started_at || t.comment || t.time_source !== 'none');
    const replaceable = (existing ?? []).filter((t) => !touched.includes(t));

    const touchedTitles = new Set(touched.map((t) => t.title.toLowerCase().trim()));
    const toInsert = flags.replace ? tasks.filter((t) => !touchedTitles.has(t.title.toLowerCase())) : tasks;

    const report = {
      date,
      replace: Boolean(flags.replace),
      kept: touched.map((t) => ({ id: t.id, title: t.title, status: t.status, actual_minutes: t.actual_minutes })),
      deleted: replaceable.map((t) => ({ id: t.id, title: t.title })),
      inserted: toInsert.map((t) => `${t.planned_time ?? '—'} ${t.title} [${t.category}]`),
    };
    if (!apply) return out({ ...report, dry_run: true, hint: 'добавь --apply, чтобы записать' });

    const { error: e1 } = await sb().from('daily_plans').upsert({
      plan_date: date,
      mode: payload.mode ?? 'green',
      main_goal: payload.main_goal ?? null,
      first_step: payload.first_step ?? null,
      notes: payload.notes ?? null,
    }, { onConflict: 'plan_date' });
    if (e1) throw e1;

    if (flags.replace && replaceable.length) {
      const { error } = await sb().from('daily_tasks').delete().in('id', replaceable.map((t) => t.id));
      if (error) throw error;
    }
    if (toInsert.length) {
      const { error } = await sb().from('daily_tasks').insert(toInsert);
      if (error) throw error;
    }
    out({ ...report, dry_run: false });
  },

  async 'facts:get'(flags) {
    const date = flags.date || today();
    const day = await loadDay(date);
    if (flags.md) return console.log(renderDay(date, day));
    out({
      date,
      plan: day.plan,
      stats: day.stats,
      tasks: day.tasks.map((t) => ({
        id: t.id, title: t.title, category: t.category, status: t.status,
        planned: t.planned_time ? `${String(t.planned_time).slice(0, 5)}+${t.planned_minutes ?? '?'}` : null,
        fact: t.actual_minutes, source: t.time_source,
        started: timeOf(t.started_at) || null, completed: timeOf(t.completed_at) || null,
        comment: t.comment, energy: t.energy,
      })),
      facts: day.facts.map((f) => ({
        id: f.id, title: f.title, category: f.category,
        from: timeOf(f.started_at), to: timeOf(f.ended_at), minutes: f.duration_minutes,
        comment: f.comment, energy: f.energy,
      })),
      pauses: day.sessions.filter((s) => s.pause_reason).map((s) => ({
        task_id: s.task_id, from: timeOf(s.started_at), stopped_at: timeOf(s.ended_at), reason: s.pause_reason,
      })),
    });
  },

  async 'facts:add'(flags) {
    const apply = flags.apply === true || flags.apply === 'true';
    const date = flags.date || today();
    if (!flags.title) die('нужен --title');
    const row = {
      fact_date: date,
      title: String(flags.title).trim(),
      category: flags.category ?? 'other',
      started_at: toIso(date, flags.start),
      ended_at: toIso(date, flags.end),
      comment: flags.comment ?? null,
      energy: flags.energy ? Number(flags.energy) : null,
      source: flags.source ?? 'opencode',
    };
    if (!apply) return out({ dry_run: true, row, hint: 'добавь --apply' });
    const { data, error } = await sb().from('fact_logs').insert(row).select().single();
    if (error) throw error;
    out({ dry_run: false, fact: data });
  },

  async 'task:start'(flags) {
    if (!flags.id) die('нужен --id');
    const { data, error } = await sb().rpc('start_task', { p_task_id: flags.id });
    if (error) throw error;
    out({ task: data });
  },

  async 'task:pause'(flags) {
    if (!flags.id) die('нужен --id');
    const { data, error } = await sb().rpc('pause_task', {
      p_task_id: flags.id,
      p_reason: flags.reason ?? null,
      p_as_fact: flags['as-fact'] === true || flags['as-fact'] === 'true',
      p_fact_category: flags.category ?? null,
    });
    if (error) throw error;
    out({ task: data, as_fact: Boolean(flags['as-fact']) });
  },

  async 'task:resume'(flags) {
    if (!flags.id) die('нужен --id');
    const { data, error } = await sb().rpc('resume_task', { p_task_id: flags.id });
    if (error) throw error;
    out({ task: data });
  },

  async 'task:complete'(flags) {
    if (!flags.id) die('нужен --id');
    const { data, error } = await sb().rpc('complete_task', {
      p_task_id: flags.id,
      p_comment: flags.comment ?? null,
      p_energy: flags.energy ? Number(flags.energy) : null,
    });
    if (error) throw error;
    out({ task: data });
  },

  /**
   * Ищет конфликты у задач, закрытых без старта (time_source='planned'):
   * их плановый интервал пересекается с реально зафиксированным временем.
   * Конфликтующие переносятся в ближайшее свободное окно как факт.
   */
  async 'day:reconcile'(flags) {
    const date = flags.date || today();
    const apply = flags.apply === true || flags.apply === 'true';
    const day = await loadDay(date);
    const busy = [];
    for (const s of day.sessions) { const i = interval(s.started_at, s.ended_at); if (i) busy.push(i); }
    for (const f of day.facts) { const i = interval(f.started_at, f.ended_at); if (i) busy.push(i); }

    const candidates = day.tasks
      .filter((t) => t.status === 'done' && t.time_source === 'planned' && t.planned_time && t.planned_minutes)
      .map((t) => {
        const [h, m] = String(t.planned_time).split(':');
        const start = Number(h) * 60 + Number(m);   // время суток как минуты, без TZ
        return { task: t, s: start, e: start + t.planned_minutes };
      })
      .sort((a, b) => a.s - b.s);

    const moves = [];
    for (const c of candidates) {
      const clash = busy.some((b) => c.s < b.e && b.s < c.e);
      if (!clash) continue;
      const place = pickGap(gaps(busy), c.task.planned_minutes, c.s);
      if (!place) {
        moves.push({ task_id: c.task.id, title: c.task.title, from: `${hhmm(c.s)}–${hhmm(c.e)}`, to: null, skipped: 'нет свободного окна' });
        continue;
      }
      const to = { s: place.start, e: place.start + c.task.planned_minutes };
      busy.push(to);
      moves.push({
        task_id: c.task.id, title: c.task.title,
        from: `${hhmm(c.s)}–${hhmm(c.e)}`,
        to: `${hhmm(to.s)}–${hhmm(to.e)}`,
        _to: to,
      });
    }

    const report = { date, conflicts: moves.length, moves: moves.map(({ _to, ...m }) => m) };
    if (!apply || !moves.length) return out({ ...report, dry_run: true });

    const done = [];
    for (const m of moves) {
      if (!m._to) continue;
      const { data: fact, error } = await sb().from('fact_logs').insert({
        fact_date: date,
        title: m.title,
        category: day.tasks.find((t) => t.id === m.task_id)?.category ?? 'other',
        started_at: new Date(`${date}T${hhmm(m._to.s)}:00${tzOffset(date)}`).toISOString(),
        ended_at: new Date(`${date}T${hhmm(m._to.e)}:00${tzOffset(date)}`).toISOString(),
        comment: 'перенос: выполнено без старта, конфликт времени',
        source: 'opencode',
        task_id: m.task_id,
      }).select().single();
      if (error) throw error;
      await sb().from('daily_tasks').update({ time_source: 'fact', actual_minutes: null }).eq('id', m.task_id);
      done.push({ task_id: m.task_id, fact_id: fact.id, to: m.to });
    }
    out({ ...report, dry_run: false, applied: done });
  },

  /**
   * Закрывает висящие таймеры и отдаёт отчёт для десктопного разбора.
   * Без --apply — только показывает, что закроется.
   */
  async 'day:close'(flags) {
    const date = flags.date || today();
    const apply = flags.apply === true || flags.apply === 'true';
    const day = await loadDay(date);
    const openSessions = day.sessions.filter((s) => !s.ended_at);
    const openFacts = day.facts.filter((f) => !f.ended_at && f.started_at);
    const pending = day.tasks.filter((t) => ['planned', 'active', 'paused'].includes(t.status));
    const report = {
      date,
      close_sessions: openSessions.map((s) => ({ id: s.id, task_id: s.task_id, from: timeOf(s.started_at) })),
      close_facts: openFacts.map((f) => ({ id: f.id, title: f.title, from: timeOf(f.started_at) })),
      pending_tasks: pending.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      stats: day.stats,
    };
    if (!apply) return out({ ...report, dry_run: true, hint: '--apply закроет таймеры и запишет числа в daily_summaries' });

    for (const s of openSessions) await sb().from('task_sessions').update({ ended_at: new Date().toISOString() }).eq('id', s.id);
    for (const f of openFacts) await sb().from('fact_logs').update({ ended_at: new Date().toISOString() }).eq('id', f.id);

    const fresh = await loadDay(date);
    if (fresh.stats) {
      await sb().from('daily_summaries').upsert({
        summary_date: date,
        done_count: fresh.stats.done_count,
        planned_count: fresh.stats.planned_count,
        planned_minutes: fresh.stats.planned_minutes,
        tracked_minutes: fresh.stats.tracked_minutes,
        imputed_minutes: fresh.stats.imputed_minutes,
        fact_minutes: fresh.stats.fact_minutes,
        energy_avg: fresh.stats.energy_avg,
      }, { onConflict: 'summary_date' });
    }
    out({ ...report, dry_run: false, closed: { sessions: openSessions.length, facts: openFacts.length }, stats: fresh.stats });
  },

  async 'summary:upsert'(flags) {
    const apply = flags.apply === true || flags.apply === 'true';
    if (!flags.file) die('нужен --file tmp/summary.json');
    const p = JSON.parse(readFileSync(flags.file, 'utf8'));
    const row = {
      summary_date: p.date || p.summary_date,
      wins: p.wins ?? null,
      blockers: p.blockers ?? null,
      ai_review: p.ai_review ?? null,
      tomorrow_mode: p.tomorrow_mode ?? null,
      ...(p.energy_avg != null ? { energy_avg: p.energy_avg } : {}),
    };
    if (!row.summary_date) die('нужна дата в файле (date)');
    if (!apply) return out({ dry_run: true, row, hint: 'добавь --apply' });
    const { data, error } = await sb().from('daily_summaries').upsert(row, { onConflict: 'summary_date' }).select().single();
    if (error) throw error;
    out({ dry_run: false, summary: data });
  },
};

// ---------- запуск ----------
const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !commands[cmd]) {
  console.log(`tracker.mjs — команды:
  doctor
  plan:get      --date YYYY-MM-DD [--md]
  plan:push     --date YYYY-MM-DD --file tmp/plan.json [--replace] [--apply]
  facts:get     --date YYYY-MM-DD [--md]
  facts:add     --date ... --title ... [--start 14:10] [--end 14:40] [--category] [--comment] [--apply]
  task:start    --id <uuid>
  task:pause    --id <uuid> [--reason ...] [--as-fact] [--category ...]
  task:resume   --id <uuid>
  task:complete --id <uuid> [--comment ...] [--energy 1-5]
  day:reconcile --date ... [--apply]
  day:close     --date ... [--apply]
  summary:upsert --file tmp/summary.json [--apply]`);
  process.exit(cmd ? 1 : 0);
}

try {
  await commands[cmd](parseArgs(rest));
} catch (e) {
  console.error(`✖ ${cmd}: ${e.message}`);
  if (e.details) console.error(e.details);
  process.exit(1);
}
