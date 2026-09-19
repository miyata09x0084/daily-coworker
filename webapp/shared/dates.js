/**
 * 日付ユーティリティ。
 *
 * このアプリは「いつ話したか」「いつまでにやるか」が中心なので、
 * 日付は必ずタイムゾーンを明示して日単位キー（YYYY-MM-DD）に正規化してから扱う。
 * 日跨ぎの誤差がそのまま「期限切れの見落とし」になるため、
 * 時刻付き Date をそのまま比較しない。
 */

const DAY_MS = 86400000;
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** Date → 指定タイムゾーンでの 'YYYY-MM-DD' */
export function dayKey(date, tz = 'Asia/Tokyo') {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new TypeError('dayKey: 不正な日付です');
  // en-CA は YYYY-MM-DD 形式を返す
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function todayKey(tz = 'Asia/Tokyo', now = new Date()) {
  return dayKey(now, tz);
}

export function isDayKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = toUtcMs(value);
  return !Number.isNaN(ms) && dayKeyFromUtcMs(ms) === value;
}

/** 'YYYY-MM-DD' → UTC ミリ秒（正午基準。DST やタイムゾーン差で日がずれないように） */
function toUtcMs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

function dayKeyFromUtcMs(ms) {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** a - b を日数で返す（a が後なら正） */
export function diffDays(a, b) {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS);
}

export function addDays(key, n) {
  return dayKeyFromUtcMs(toUtcMs(key) + n * DAY_MS);
}

/** 0=日曜 .. 6=土曜 */
export function weekdayIndex(key) {
  return new Date(toUtcMs(key)).getUTCDay();
}

/** 月曜始まりの週頭 */
export function startOfWeek(key) {
  const wd = weekdayIndex(key);
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

/** 連続する日付キーの配列（両端含む） */
export function rangeDays(fromKey, toKey) {
  const out = [];
  const total = diffDays(toKey, fromKey);
  for (let i = 0; i <= total; i += 1) out.push(addDays(fromKey, i));
  return out;
}

/** '2026-09-22' → '9月22日(月)' */
export function formatJa(key, { weekday = true } = {}) {
  const [, m, d] = key.split('-').map(Number);
  const base = `${m}月${d}日`;
  return weekday ? `${base}(${WEEKDAY_JA[weekdayIndex(key)]})` : base;
}

/** 期限までの距離を人の言葉にする。抜け漏れ防止の表示に使う */
export function relativeJa(key, todayK) {
  const d = diffDays(key, todayK);
  if (d === 0) return '今日';
  if (d === 1) return '明日';
  if (d === 2) return 'あさって';
  if (d === -1) return '昨日';
  if (d < 0) return `${-d}日すぎ`;
  return `あと${d}日`;
}
