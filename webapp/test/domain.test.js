import assert from 'node:assert/strict';
import test from 'node:test';
import * as domain from '../server/domain.js';
import { emptyDb } from '../server/store.js';

const NOW = new Date('2026-09-19T09:00:00+09:00');

test('やりとりとやくそくを1回で作れる', () => {
  const db = emptyDb();
  const { interaction, commitments } = domain.createInteraction(
    db,
    {
      summary: '通院の日程を決めた',
      channel: 'face',
      condition: 4,
      understanding: 'readback',
      techniques: ['written', 'concrete_date'],
      commitments: [
        { title: '病院に電話する', owner: 'partner', due: '2026-09-22', steps: [{ text: '9時すぎにかける' }] },
      ],
    },
    NOW,
  );

  assert.equal(interaction.day, '2026-09-19');
  assert.equal(interaction.condition, 4);
  assert.deepEqual(interaction.techniques, ['written', 'concrete_date']);
  assert.equal(commitments.length, 1);
  assert.equal(commitments[0].interactionId, interaction.id);
  assert.equal(commitments[0].steps.length, 1);
  assert.equal(commitments[0].status, 'open');
  assert.equal(db.commitments.length, 1);
});

test('本文がなければ保存しない', () => {
  const db = emptyDb();
  assert.throws(() => domain.createInteraction(db, { summary: '   ' }, NOW), domain.ValidationError);
  assert.equal(db.interactions.length, 0);
});

test('選択肢にない値は弾く', () => {
  const db = emptyDb();
  assert.throws(
    () => domain.createInteraction(db, { summary: 'x', techniques: ['テレパシー'] }, NOW),
    domain.ValidationError,
  );
  assert.throws(() => domain.createInteraction(db, { summary: 'x', condition: 9 }, NOW), domain.ValidationError);
  assert.throws(() => domain.createInteraction(db, { summary: 'x', channel: 'fax' }, NOW), domain.ValidationError);
});

test('存在しない日付を期限にできない', () => {
  const db = emptyDb();
  assert.throws(
    () => domain.createCommitment(db, { title: 'x', due: '2026-02-30' }, NOW),
    domain.ValidationError,
  );
});

test('やりとりを消してもやくそくは残り、リンクだけ外れる', () => {
  const db = emptyDb();
  const { interaction } = domain.createInteraction(
    db,
    { summary: '話した', commitments: [{ title: '書類を出す' }] },
    NOW,
  );
  domain.deleteInteraction(db, interaction.id);
  assert.equal(db.interactions.length, 0);
  assert.equal(db.commitments.length, 1);
  assert.equal(db.commitments[0].interactionId, null);
});

test('完了・取り下げ・差し戻しで doneAt が正しく動く', () => {
  const db = emptyDb();
  const c = domain.createCommitment(db, { title: '電話する' }, NOW);

  domain.updateCommitment(db, c.id, { status: 'done' }, NOW);
  assert.equal(c.status, 'done');
  assert.equal(c.doneAt, NOW.toISOString());

  domain.updateCommitment(db, c.id, { status: 'open' }, NOW);
  assert.equal(c.doneAt, null);

  domain.updateCommitment(db, c.id, { status: 'dropped', dropReason: 'もう必要なくなった' }, NOW);
  assert.equal(c.doneAt, null);
  assert.equal(c.dropReason, 'もう必要なくなった');
});

test('伝え直しは回数として積み上がる', () => {
  const db = emptyDb();
  const c = domain.createCommitment(db, { title: '電話する' }, NOW);
  domain.updateCommitment(db, c.id, { addReminder: true }, NOW);
  domain.updateCommitment(db, c.id, { addReminder: 'LINEで送った' }, NOW);
  assert.equal(c.reminders.length, 2);
  assert.equal(c.reminders[1].note, 'LINEで送った');
});

test('手順は多すぎると拒む（本人が追えなくなるため）', () => {
  const db = emptyDb();
  const steps = Array.from({ length: 13 }, (_, i) => ({ text: `手順${i}` }));
  assert.throws(() => domain.createCommitment(db, { title: 'x', steps }, NOW), domain.ValidationError);
});

test('目標を消すと紐づけだけ外れる', () => {
  const db = emptyDb();
  const goal = domain.createGoal(db, { title: '就労に慣れる', milestones: [{ title: '見学に行く' }] }, NOW);
  const { interaction } = domain.createInteraction(db, { summary: '話した', goalId: goal.id }, NOW);
  const c = domain.createCommitment(db, { title: '申し込む', goalId: goal.id }, NOW);

  domain.deleteGoal(db, goal.id);
  assert.equal(db.goals.length, 0);
  assert.equal(db.interactions.find((i) => i.id === interaction.id).goalId, null);
  assert.equal(db.commitments.find((x) => x.id === c.id).goalId, null);
});

test('存在しない参照は 404 として扱う', () => {
  const db = emptyDb();
  assert.throws(() => domain.createCommitment(db, { title: 'x', goalId: 'ない' }, NOW), domain.NotFoundError);
  assert.throws(() => domain.updateCommitment(db, 'ない', {}, NOW), domain.NotFoundError);
});

test('設定のしきい値は範囲を検査する', () => {
  const db = emptyDb();
  domain.updateSettings(db, { maxOpenAtOnce: 5, partnerName: 'けんじ' });
  assert.equal(db.settings.maxOpenAtOnce, 5);
  assert.equal(db.settings.partnerName, 'けんじ');
  assert.throws(() => domain.updateSettings(db, { staleDays: 0 }), domain.ValidationError);
  assert.throws(() => domain.updateSettings(db, { tz: 'Mars/Olympus' }), domain.ValidationError);
});
