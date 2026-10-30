// Dates travel as 'YYYY-MM-DD' strings in local time, the same shape the visits table stores.
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function todayString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayNumber(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function weekdayOf(date) {
  return WEEKDAYS[new Date(dayNumber(date) * 86400000).getUTCDay()];
}
