import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHandoffCard, buildWeeklyReview } from '../server/handoff.js';
import { buildInsights } from '../server/insights.js';
import { NOW, addCommitment, addGoal, addInteraction, day, fixture } from './helpers.js';

const card = (db, options) => buildHandoffCard(db, buildInsights(db, NOW), options);

test('カードは期限を具体的な日付で書く', () => {
  const db = fixture();
  addCommitment(db, { title: '病院に電話する', owner: 'partner', due: day(3), daysAgo: 0 });

  const { text } = card(db, { nextTalkDate: day(5) });
  assert.match(text, /9月22日\(火\)まで/);
  assert.match(text, /病院に電話する/);
  assert.match(text, /つぎに話すのは 9月24日\(木\)/);
});

test('一度に渡す件数は上限で止め、残りは記録者にだけ伝える', () => {
  const db = fixture();
  for (let i = 0; i < 5; i += 1) {
    addCommitment(db, { title: `用事${i}`, owner: 'partner', due: day(i + 1), daysAgo: 0 });
  }
  const result = card(db);
  assert.equal(result.shownCount, 3);
  assert.equal(result.deferred.length, 2);
  assert.match(result.note, /2件はカードに載せていません/);
  assert.ok(!result.text.includes('用事4'), 'あふれた分はカード本文に出ない');
});

test('過ぎた日付はカードに一切出さない（責める紙にしない）', () => {
  const db = fixture();
  addCommitment(db, { title: '書類を出す', owner: 'partner', due: day(-4), daysAgo: 10 });
  const { text } = card(db);

  assert.match(text, /書類を出す/);
  assert.match(text, /いつまで: （いっしょに日にちを決める）/);
  assert.ok(!text.includes('9月15日'), '過ぎた日付そのものを載せない');
  for (const blame of ['すぎ', '遅れ', 'まだ', 'できていない', '忘れ']) {
    assert.ok(!text.includes(blame), `カードに責めの語が入っている: ${blame}`);
  }
});

test('記録者の画面には経過日数が残る（情報は落とさない）', () => {
  const db = fixture();
  addCommitment(db, { title: '書類を出す', owner: 'partner', due: day(-4), daysAgo: 10 });
  const [point] = buildInsights(db, NOW).talkingPoints;
  assert.equal(point.reason, '決めた日から4日たっています');
});

test('手順は未完了のものだけを並べる', () => {
  const db = fixture();
  addCommitment(db, {
    title: '区役所に行く',
    owner: 'partner',
    due: day(2),
    steps: [
      { text: '身分証を持つ', done: true },
      { text: '9時すぎに行く' },
    ],
  });
  const { text } = card(db);
  assert.match(text, /- 9時すぎに行く/);
  assert.ok(!text.includes('身分証を持つ'), '終わった手順は載せない');
});

test('直近1週間にできたことを先に置く', () => {
  const db = fixture();
  addCommitment(db, { title: '書類を出した', owner: 'partner', status: 'done', daysAgo: 2 });
  addCommitment(db, { title: '古い完了', owner: 'partner', status: 'done', daysAgo: 30 });
  addCommitment(db, { title: '次の用事', owner: 'partner', due: day(2) });

  const { text, praiseCount } = card(db);
  assert.equal(praiseCount, 1);
  assert.ok(text.indexOf('【できたこと】') < text.indexOf('【おねがい】'));
  assert.match(text, /書類を出した/);
  assert.ok(!text.includes('古い完了'));
});

test('自分の担当分は載せる／載せないを選べる', () => {
  const db = fixture();
  addCommitment(db, { title: '制度を調べる', owner: 'me', due: day(1) });
  assert.match(card(db, { includeMine: true }).text, /制度を調べる/);
  assert.ok(!card(db, { includeMine: false }).text.includes('制度を調べる'));
});

test('お願いがないときも空のカードにならない', () => {
  const db = fixture();
  const { text } = card(db);
  assert.match(text, /【おねがい】/);
  assert.match(text, /いまは ありません/);
});

test('ふりかえりは今週と先週を並べ、判定できない分析は断りを入れる', () => {
  const db = fixture();
  addInteraction(db, { summary: '今週の話', daysAgo: 1, condition: 4 });
  addInteraction(db, { summary: '先週の話', daysAgo: 8, condition: 2 });
  addCommitment(db, { title: '今週できた', status: 'done', daysAgo: 1 });
  addGoal(db, { title: '就労に慣れる', milestones: [{ title: '見学' }], daysAgo: 3 });

  const md = buildWeeklyReview(db, buildInsights(db, NOW));
  assert.match(md, /# ふりかえり 9月14日\(月\) 〜 9月20日\(日\)/);
  assert.match(md, /\| 記録した日 \| 1日 \| 1日 \|/);
  assert.match(md, /今週できた/);
  assert.match(md, /まだ判断できません/);
  assert.match(md, /就労に慣れる/);
  assert.match(md, /つぎの一歩: 見学/);
});

test('ふりかえりは効き目が出せるようになったら数字で書く', () => {
  const db = fixture();
  const withTech = addInteraction(db, { summary: '書いた', techniques: ['written'], daysAgo: 20 });
  const without = addInteraction(db, { summary: '言った', techniques: [], daysAgo: 20 });
  for (let i = 0; i < 3; i += 1) {
    addCommitment(db, { title: `w${i}`, interactionId: withTech.id, status: 'done', daysAgo: 18 });
    addCommitment(db, { title: `o${i}`, interactionId: without.id, status: 'dropped', daysAgo: 18 });
  }
  const md = buildWeeklyReview(db, buildInsights(db, NOW));
  assert.match(md, /書いて渡した: あり 100% \/ なし 0%（差 \+100pt）/);
});
