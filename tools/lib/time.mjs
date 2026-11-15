/** Чистые функции времени и окон. Без зависимостей — легко тестировать. */
export const TZ = process.env.TRACKER_TZ || 'Europe/Moscow';
export const DAY_START = 6 * 60;
export const DAY_END = 23 * 60 + 30;

export const pad = (n) => String(n).padStart(2, '0');

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export function tzOffset(dateStr) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${dateStr}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName').value;
  return part.replace('GMT', '') || '+00:00';
}

/** "14:10" | "2026-11-15T14:10" | ISO → ISO-строка в TZ трекера */
export function toIso(dateStr, value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    return new Date(`${dateStr}T${pad(h)}:${pad(m)}:00${tzOffset(dateStr)}`).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    return new Date(`${s}${tzOffset(dateStr)}`).toISOString();
  }
  return new Date(s).toISOString();
}

export function toMin(iso) {
  if (!iso) return null;
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === 'hour').value) * 60 + Number(p.find((x) => x.type === 'minute').value);
}

export const hhmm = (min) => (min == null ? '' : `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`);
export const timeOf = (iso) => (iso ? hhmm(toMin(iso)) : '');
export const dur = (min) => (min == null ? '' : (min >= 60 ? `${Math.floor(min / 60)} ч ${pad(min % 60)} мин` : `${min} мин`));

export function interval(startIso, endIso) {
  const s = toMin(startIso);
  const e = toMin(endIso);
  if (s == null || e == null || e === s) return null;   // нулевой интервал не занимает время
  return { s, e: e < s ? 1440 : e };
}

export function merge(busy) {
  const list = [...busy].sort((a, b) => a.s - b.s);
  const res = [];
  for (const cur of list) {
    const last = res[res.length - 1];
    if (last && cur.s <= last.e) last.e = Math.max(last.e, cur.e);
    else res.push({ ...cur });
  }
  return res;
}

export function gaps(busy, from = DAY_START, to = DAY_END) {
  const res = [];
  let cursor = from;
  for (const b of merge(busy)) {
    if (b.e <= cursor) continue;
    if (b.s > cursor) res.push({ s: cursor, e: Math.min(b.s, to) });
    cursor = Math.max(cursor, b.e);
    if (cursor >= to) break;
  }
  if (cursor < to) res.push({ s: cursor, e: to });
  return res.filter((g) => g.e > g.s);
}

export function pickGap(gapList, len, target) {
  let best = null;
  for (const g of gapList) {
    if (g.e - g.s < len) continue;
    const start = Math.min(Math.max(target, g.s), g.e - len);
    const dist = Math.abs(start - target);
    if (!best || dist < best.dist) best = { start, dist };
  }
  return best;
}
