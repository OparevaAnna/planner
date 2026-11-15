import { useCallback, useEffect, useState } from 'react';
import {
  addFact, catOf, completeTask, ensureAuth, hhmm, initTelegram, isoAt, loadDay,
  MODES, notify, patchTask, pauseTask, resumeTask, setTaskTime, startTask, todayStr,
} from './lib/api';
import { haptic } from './lib/api';
import TaskCard from './components/TaskCard';
import { DoneSheet, FactSheet, PauseSheet } from './components/Sheets';

const dateLabel = () =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', weekday: 'short', day: 'numeric', month: 'long',
  }).format(new Date());

export default function App() {
  const date = todayStr();
  const [day, setDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('plan');
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    const d = await loadDay(date);
    setDay(d);
    return d;
  }, [date]);

  const boot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await initTelegram();
      await ensureAuth();
      await refresh();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => { boot(); }, [boot]);

  useEffect(() => {
    if (!day?.tasks.some((t) => t.status === 'active')) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [day]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  };

  const reload = () => refresh().catch((e) => flash(e.message || 'Не обновилось'));

  /**
   * «Готово» и правка времени. Ручное время главнее таймера и плана:
   * сначала закрываем задачу (complete_task), потом, если время меняли,
   * пишем его в daily_tasks как time_source='fact'.
   */
  const submitDone = async ({ comment, energy, times }) => {
    const task = sheet.task;
    const span = times ? { start: isoAt(date, times.start), end: isoAt(date, times.end) } : null;

    if (sheet.edit) {
      if (span) {
        await setTaskTime(task.id, { ...span, comment, energy });
      } else if (comment !== (task.comment ?? '') || energy !== (task.energy ?? null)) {
        await patchTask(task.id, {
          comment: comment || null,
          ...(energy ? { energy } : {}),
        });
      }
      return;
    }

    await completeTask(task.id, { comment, energy });
    if (span) await setTaskTime(task.id, { ...span, comment, energy });
  };

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      haptic();
      if (msg) flash(msg);
    } catch (e) {
      notify('error');
      flash(e.message || 'Ошибка');
    } finally {
      setBusy(false);
      setSheet(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[14px] text-[var(--muted)]">
        Загружаю день…
      </div>
    );
  }

  if (error) {
    return (
      <div className="safe-t flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="text-[40px]">🔒</div>
        <div className="text-[15px]">{error}</div>
        <button onClick={boot} className="mt-2 h-10 rounded-xl bg-[var(--accent)] px-5 text-[14px] font-semibold text-black">
          Повторить
        </button>
      </div>
    );
  }

  const tasks = day?.tasks ?? [];
  const facts = day?.facts ?? [];
  const mode = MODES[day?.plan?.mode] ?? MODES.green;
  const openFact = facts.find((f) => f.started_at && !f.ended_at);
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="flex h-full flex-col">
      <header className="safe-t sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 pb-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-[13px] uppercase tracking-wide text-[var(--muted)]">{dateLabel()}</div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--muted)]">{doneCount}/{tasks.length}</span>
            <button
              onClick={reload}
              aria-label="Обновить"
              className="h-7 w-7 rounded-lg border border-[var(--line)] text-[13px] text-[var(--muted)] active:opacity-60"
            >
              ↻
            </button>
          </div>
        </div>
        <div className="mt-1 flex items-start gap-2">
          <span className="text-[16px] leading-6">{mode.icon}</span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">
              {day?.plan?.main_goal || 'Плана на сегодня нет'}
            </div>
            {day?.plan?.first_step && (
              <div className="truncate text-[12px] text-[var(--muted)]">Первый шаг: {day.plan.first_step}</div>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-1 rounded-xl bg-[var(--card)] p-1">
          {[['plan', 'План'], ['facts', `Факты${facts.length ? ` ${facts.length}` : ''}`]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`h-8 flex-1 rounded-lg text-[13px] ${tab === id ? 'bg-[var(--card2)] font-semibold text-[var(--fg)]' : 'text-[var(--muted)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'plan' && (
          <div className="space-y-2 pb-28">
            {tasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center text-[13px] text-[var(--muted)]">
                На сегодня плана нет. Он появится утром после чек-ина на ноутбуке.
              </div>
            )}
            {tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                session={day?.open}
                now={now}
                onStart={(task) => act(() => startTask(task.id))}
                onResume={(task) => act(() => resumeTask(task.id))}
                onPause={(task) => setSheet({ type: 'pause', task })}
                onDone={(task) => setSheet({ type: 'done', task })}
                onEdit={(task) => setSheet({ type: 'done', task, edit: true })}
              />
            ))}
          </div>
        )}

        {tab === 'facts' && (
          <div className="space-y-2 pb-28">
            {openFact && (
              <div className="rounded-2xl border border-[var(--accent)] bg-[var(--card2)] p-3.5">
                <div className="text-[11px] uppercase tracking-wide text-[var(--accent)]">сейчас идёт</div>
                <div className="mt-0.5 text-[15px]">{openFact.title}</div>
                <div className="mt-1 text-[12px] text-[var(--muted)]">
                  с {hhmm(openFact.started_at)} · {catOf(openFact.category).label}
                </div>
              </div>
            )}
            {facts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center text-[13px] text-[var(--muted)]">
                Пока пусто. Всё, что случилось вне плана, — сюда.
              </div>
            )}
            {facts.map((f) => {
              const cat = catOf(f.category);
              return (
                <div key={f.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[14px] leading-snug">{f.title}</div>
                    <div className="shrink-0 text-[12px] tabular-nums text-[var(--muted)]">
                      {hhmm(f.started_at)}–{f.ended_at ? hhmm(f.ended_at) : '…'}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
                      {cat.label}
                    </span>
                    {f.duration_minutes != null && <span>{f.duration_minutes} мин</span>}
                  </div>
                  {f.comment && <div className="mt-1.5 text-[12px] text-[var(--muted)]">{f.comment}</div>}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <div className="safe-b pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center">
        <button
          onClick={() => setSheet({ type: 'fact' })}
          className="pointer-events-auto mb-3 flex h-11 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-[14px] font-semibold text-black shadow-lg shadow-black/30"
        >
          + Факт
        </button>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-6">
          <div className="rounded-full bg-black/80 px-4 py-2 text-[12px] text-white">{toast}</div>
        </div>
      )}

      {sheet?.type === 'pause' && (
        <PauseSheet
          task={sheet.task}
          busy={busy}
          onClose={() => setSheet(null)}
          onSubmit={(d) => act(() => pauseTask(sheet.task.id, d), d.asFact ? 'Пауза записана как дело' : 'Пауза')}
        />
      )}
      {sheet?.type === 'done' && (
        <DoneSheet
          task={sheet.task}
          edit={Boolean(sheet.edit)}
          busy={busy}
          onClose={() => setSheet(null)}
          onSubmit={(d) => act(() => submitDone(d), d.times ? 'Время записано' : 'Записано')}
        />
      )}
      {sheet?.type === 'fact' && (
        <FactSheet
          busy={busy}
          onClose={() => setSheet(null)}
          onSubmit={(d) => act(
            () => addFact({
              date,
              title: d.title,
              category: d.category,
              start: isoAt(date, d.start),
              end: isoAt(date, d.end),
              comment: d.comment,
            }),
            'Факт добавлен',
          )}
        />
      )}
    </div>
  );
}
