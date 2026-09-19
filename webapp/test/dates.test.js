import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDays,
  dayKey,
  diffDays,
  formatJa,
  isDayKey,
  rangeDays,
  relativeJa,
  startOfWeek,
  weekdayIndex,
} from '../shared/dates.js';

test('dayKey はタイムゾーンごとの日付を返す', () => {
  // UTC 2026-09-19T16:00 は日本時間では翌日の 1:00
  const iso = '2026-09-19T16:00:00.000Z';
  assert.equal(dayKey(iso, 'Asia/Tokyo'), '2026-09-20');
  assert.equal(dayKey(iso, 'UTC'), '2026-09-19');
});

test('dayKey は不正な日付を拒む', () => {
  assert.throws(() => dayKey('まったく日付ではない'), TypeError);
});

test('isDayKey は実在しない日付を弾く', () => {
  assert.equal(isDayKey('2026-09-19'), true);
  assert.equal(isDayKey('2026-02-30'), false);
  assert.equal(isDayKey('2026-13-01'), false);
  assert.equal(isDayKey('2026-9-1'), false);
  assert.equal(isDayKey(null), false);
});

test('diffDays は月またぎでも日数で数える', () => {
  assert.equal(diffDays('2026-10-01', '2026-09-30'), 1);
  assert.equal(diffDays('2026-09-30', '2026-10-01'), -1);
  assert.equal(diffDays('2027-01-01', '2026-01-01'), 365);
  assert.equal(diffDays('2026-09-19', '2026-09-19'), 0);
});

test('diffDays は夏時間のある地域でもずれない', () => {
  // 米国の夏時間切り替えをまたぐ区間。正午基準で計算しているのでちょうど1日。
  assert.equal(diffDays('2026-03-09', '2026-03-08'), 1);
  assert.equal(diffDays('2026-11-02', '2026-11-01'), 1);
});

test('addDays と rangeDays', () => {
  assert.equal(addDays('2026-09-19', 1), '2026-09-20');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.deepEqual(rangeDays('2026-09-19', '2026-09-21'), ['2026-09-19', '2026-09-20', '2026-09-21']);
});

test('startOfWeek は月曜を返す', () => {
  // 2026-09-19 は土曜
  assert.equal(weekdayIndex('2026-09-19'), 6);
  assert.equal(startOfWeek('2026-09-19'), '2026-09-14');
  // 日曜は前の週の月曜に寄せる
  assert.equal(startOfWeek('2026-09-20'), '2026-09-14');
  assert.equal(startOfWeek('2026-09-14'), '2026-09-14');
});

test('formatJa と relativeJa', () => {
  assert.equal(formatJa('2026-09-22'), '9月22日(火)');
  assert.equal(formatJa('2026-09-22', { weekday: false }), '9月22日');
  assert.equal(relativeJa('2026-09-19', '2026-09-19'), '今日');
  assert.equal(relativeJa('2026-09-20', '2026-09-19'), '明日');
  assert.equal(relativeJa('2026-09-16', '2026-09-19'), '3日すぎ');
  assert.equal(relativeJa('2026-09-26', '2026-09-19'), 'あと7日');
});
