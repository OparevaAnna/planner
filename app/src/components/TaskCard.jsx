import { catOf, clean, minutesOf } from '../lib/api';

const STATUS = {
  planned: null,
  active: { text: 'идёт', cls: 'text-[var(--accent)]' },
  paused: { text: 'пауза', cls: 'text-amber-400' },
  done: { text: 'готово', cls: 'text-[var(--muted)]' },
  skipped: { text: 'пропущено', cls: 'text-[var(--muted)]' },
};

function fmtElapsed(min) {
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}:${String(min % 60).padStart(2, '0')}` : `${min} мин`;
}

export default function TaskCard({ task, session, now, onStart, onPause, onDone, onResume, onEdit }) {
  const cat = catOf(task.category);
  const isDone = task.status === 'done';
  const isActive = task.status === 'active';
  const isPaused = task.status === 'paused';
  const live = isActive && session?.task_id === task.id
    ? fmtElapsed(minutesOf(session.started_at, now))
    : null;

  const status = STATUS[task.status];

  return (
    <div
      onClick={isDone ? () => onEdit?.(task) : undefined}
      className={`rounded-2xl border p-3.5 transition-colors ${
        isDone ? 'cursor-pointer active:opacity-80' : ''
      } ${
        isActive
          ? 'border-[var(--accent)] bg-[var(--card2)]'
          : isDone
            ? 'border-[var(--line)] bg-[var(--card)] opacity-70'
            : 'border-[var(--line)] bg-[var(--card)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 shrink-0 pt-0.5 text-[13px] tabular-nums text-[var(--muted)]">
          {clean(task.planned_time) || '—'}
        </div>

        <div className="min-w-0 flex-1">
          <div className={`text-[15px] leading-snug ${isDone ? 'line-through decoration-1' : ''}`}>
            {task.title}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full" style={{ background: cat.color }} />
              {cat.label}
            </span>
            {task.planned_minutes ? <span>{task.planned_minutes} мин план</span> : null}
            {task.actual_minutes != null && (
              <span className={task.time_source === 'tracked' ? 'text-[var(--fg)]' : ''}>
                {task.actual_minutes} мин факт
                {task.time_source === 'planned' ? ' (план)' : task.time_source === 'fact' ? ' (вручную)' : ''}
              </span>
            )}
            {task.is_anchor && <span className="text-[var(--muted)]">якорь</span>}
            {live && <span className="live font-medium text-[var(--accent)]">{live}</span>}
            {isDone && <span className="text-[var(--muted)]">✎ время</span>}
          </div>

          {task.comment && (
            <div className="mt-2 rounded-lg bg-black/10 px-2.5 py-1.5 text-[12px] leading-snug text-[var(--muted)]">
              {task.comment}
            </div>
          )}
        </div>

        {status && <div className={`shrink-0 text-[11px] ${status.cls}`}>{status.text}</div>}
      </div>

      {(task.status === 'planned' || isActive || isPaused) && (
        <div className="mt-3 flex gap-2">
          {task.status === 'planned' && (
            <>
              <button
                onClick={() => onStart(task)}
                className="h-9 flex-1 rounded-xl bg-[var(--accent)] text-[13px] font-semibold text-black"
              >
                Начать
              </button>
              <button
                onClick={() => onDone(task)}
                className="h-9 rounded-xl border border-[var(--line)] px-3.5 text-[13px] text-[var(--fg)]"
              >
                Готово
              </button>
            </>
          )}
          {isActive && (
            <>
              <button
                onClick={() => onPause(task)}
                className="h-9 flex-1 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[13px] font-medium text-amber-400"
              >
                ⏸ Пауза
              </button>
              <button
                onClick={() => onDone(task)}
                className="h-9 flex-1 rounded-xl bg-[var(--accent)] text-[13px] font-semibold text-black"
              >
                ✓ Готово
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button
                onClick={() => onResume(task)}
                className="h-9 flex-1 rounded-xl bg-[var(--accent)] text-[13px] font-semibold text-black"
              >
                Продолжить
              </button>
              <button
                onClick={() => onDone(task)}
                className="h-9 rounded-xl border border-[var(--line)] px-3.5 text-[13px]"
              >
                Готово
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
