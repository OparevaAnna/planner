import { useState } from 'react';
import { CATEGORIES } from '../lib/api';

function Sheet({ title, subtitle, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/55" onClick={onClose}>
      <div
        className="sheet-enter safe-b w-full rounded-t-3xl border-t border-[var(--line)] bg-[var(--bg)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--line)]" />
        <div className="mb-3">
          <div className="text-[16px] font-semibold">{title}</div>
          {subtitle && <div className="mt-0.5 text-[12px] text-[var(--muted)]">{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

function Chips({ value, onChange, only }) {
  const list = only ? CATEGORIES.filter((c) => only.includes(c.id)) : CATEGORIES;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((c) => {
        const on = value === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`rounded-full border px-3 py-1.5 text-[12px] ${on ? 'border-transparent text-black' : 'border-[var(--line)] text-[var(--muted)]'}`}
            style={on ? { background: c.color } : undefined}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

const area =
  'w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--accent)]';

export function PauseSheet({ task, onClose, onSubmit, busy }) {
  const [reason, setReason] = useState('');
  const [asFact, setAsFact] = useState(false);
  const [category, setCategory] = useState('rest');

  return (
    <Sheet
      title="Пауза"
      subtitle={reason ? 'Пауза не считается временем задачи' : 'Пустая пауза = перерыв, никуда не пишется'}
      onClose={onClose}
    >
      <textarea
        className={area}
        rows={2}
        placeholder="Что случилось? (необязательно)"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          if (e.target.value.trim()) setAsFact(true);
        }}
      />

      <label className="mt-3 flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2.5">
        <span className="text-[13px]">Записать как отдельное дело</span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--accent)]"
          checked={asFact}
          onChange={(e) => setAsFact(e.target.checked)}
        />
      </label>

      {asFact && (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] text-[var(--muted)]">Категория дела</div>
          <Chips value={category} onChange={setCategory} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-[var(--line)] text-[14px]">
          Отмена
        </button>
        <button
          disabled={busy}
          onClick={() => onSubmit({ reason: reason.trim(), asFact, category })}
          className="h-11 flex-1 rounded-xl bg-[var(--accent)] text-[14px] font-semibold text-black disabled:opacity-50"
        >
          Пауза
        </button>
      </div>
    </Sheet>
  );
}

export function DoneSheet({ task, onClose, onSubmit, busy }) {
  const [comment, setComment] = useState('');
  const [energy, setEnergy] = useState(null);

  return (
    <Sheet
      title="Готово"
      subtitle={`${task.title}${task.planned_minutes ? ` · план ${task.planned_minutes} мин` : ''}`}
      onClose={onClose}
    >
      <textarea
        className={area}
        rows={2}
        placeholder="Как прошло? Что помешало?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <div className="mt-3">
        <div className="mb-1.5 text-[12px] text-[var(--muted)]">Энергия</div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              onClick={() => setEnergy(v)}
              className={`h-9 flex-1 rounded-xl border text-[13px] ${
                energy === v ? 'border-transparent bg-[var(--accent)] text-black' : 'border-[var(--line)] text-[var(--muted)]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-[var(--line)] text-[14px]">
          Отмена
        </button>
        <button
          disabled={busy}
          onClick={() => onSubmit({ comment: comment.trim(), energy })}
          className="h-11 flex-1 rounded-xl bg-[var(--accent)] text-[14px] font-semibold text-black disabled:opacity-50"
        >
          Записать
        </button>
      </div>
    </Sheet>
  );
}

export function FactSheet({ task, onClose, onSubmit, busy }) {
  const nowTime = new Date().toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('other');
  const [start, setStart] = useState(nowTime);
  const [end, setEnd] = useState(nowTime);
  const [comment, setComment] = useState('');

  return (
    <Sheet title="Внеплановое дело" subtitle="Свободный факт за сегодня" onClose={onClose}>
      <input
        className={area}
        placeholder="Что сделала?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="mt-3">
        <div className="mb-1.5 text-[12px] text-[var(--muted)]">Категория</div>
        <Chips value={category} onChange={setCategory} />
      </div>

      <div className="mt-3 flex gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-[12px] text-[var(--muted)]">Начало</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={area} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-[12px] text-[var(--muted)]">Конец</span>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={area} />
        </label>
      </div>

      <textarea
        className={`${area} mt-3`}
        rows={2}
        placeholder="Комментарий"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <div className="mt-4 flex gap-2">
        <button onClick={onClose} className="h-11 flex-1 rounded-xl border border-[var(--line)] text-[14px]">
          Отмена
        </button>
        <button
          disabled={busy || !title.trim()}
          onClick={() => onSubmit({ title: title.trim(), category, start, end, comment: comment.trim() })}
          className="h-11 flex-1 rounded-xl bg-[var(--accent)] text-[14px] font-semibold text-black disabled:opacity-50"
        >
          Записать
        </button>
      </div>
    </Sheet>
  );
}
