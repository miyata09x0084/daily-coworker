/** テスト用の固定日付フィクスチャ。今日は 2026-09-19（土）に固定する */

import * as domain from '../server/domain.js';
import { emptyDb } from '../server/store.js';
import { addDays } from '../shared/dates.js';

export const TODAY = '2026-09-19';
export const NOW = new Date('2026-09-19T12:00:00+09:00');

export const day = (offset) => addDays(TODAY, offset);
const at = (offset, hour = 10) => new Date(`${day(offset)}T${String(hour).padStart(2, '0')}:00:00+09:00`);

export function fixture() {
  return emptyDb();
}

/** daysAgo 日前に記録されたやりとり */
export function addInteraction(db, { daysAgo = 0, ...input }) {
  const when = at(-daysAgo);
  const { interaction } = domain.createInteraction(db, { ...input, occurredAt: when.toISOString() }, when);
  return interaction;
}

/** daysAgo 日前に生まれ、idleDays 日前に最後に触られたやくそく */
export function addCommitment(db, { daysAgo = 0, idleDays = null, status = 'open', ...input }) {
  const created = at(-daysAgo);
  const c = domain.createCommitment(db, input, created);
  c.updatedAt = at(-(idleDays ?? daysAgo)).toISOString();
  if (status !== 'open') {
    c.status = status;
    if (status === 'done') c.doneAt = at(-(idleDays ?? daysAgo)).toISOString();
  }
  return c;
}

export function addGoal(db, { daysAgo = 0, ...input }) {
  return domain.createGoal(db, input, at(-daysAgo));
}
