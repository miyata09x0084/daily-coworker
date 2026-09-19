import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInsights } from '../server/insights.js';
import { NOW, TODAY, addCommitment, addGoal, addInteraction, day, fixture } from './helpers.js';

const codes = (insights) => insights.alerts.map((a) => a.code);

test('今日の日付は設定のタイムゾーンで決まる', () => {
  const db = fixture();
  const insights = buildInsights(db, NOW);
  assert.equal(insights.today, TODAY);
});

test('期限切れを検出し、いちばん古いものを名指しする', () => {
  const db = fixture();
  addCommitment(db, { title: '区役所に電話', due: day(-5), daysAgo: 8 });
  addCommitment(db, { title: '書類を出す', due: day(-1), daysAgo: 3 });
  addCommitment(db, { title: '買い物', due: day(2), daysAgo: 1 });

  const insights = buildInsights(db, NOW);
  assert.equal(insights.summary.overdue, 2);
  const overdue = insights.alerts.find((a) => a.code === 'overdue');
  assert.ok(overdue);
  assert.match(overdue.detail, /区役所に電話/);
  assert.match(overdue.detail, /5日すぎ/);
});

test('期限切れは期限内より上に並ぶ', () => {
  const db = fixture();
  const soon = addCommitment(db, { title: '近い', due: day(1), daysAgo: 0 });
  const late = addCommitment(db, { title: '遅れている', due: day(-3), daysAgo: 5 });
  const none = addCommitment(db, { title: '期限なし', daysAgo: 20 });

  const { derived } = buildInsights(db, NOW);
  assert.ok(derived[late.id].urgency > derived[soon.id].urgency);
  assert.ok(derived[soon.id].urgency > derived[none.id].urgency);
  assert.equal(derived[late.id].dueState, 'overdue');
  assert.equal(derived[none.id].dueState, 'none');
  assert.equal(derived[none.id].ageDays, 20);
});

test('同時に頼みすぎていると警告する（ワーキングメモリへの配慮）', () => {
  const db = fixture();
  for (let i = 0; i < 4; i += 1) {
    addCommitment(db, { title: `用事${i}`, owner: 'him', due: day(3) });
  }
  const insights = buildInsights(db, NOW);
  const overload = insights.alerts.find((a) => a.code === 'overload');
  assert.ok(overload, '4件（上限3件）で overload が出るはず');
  assert.match(overload.detail, /3件までが目安/);

  // 自分の担当は上限の対象外
  const db2 = fixture();
  for (let i = 0; i < 4; i += 1) addCommitment(db2, { title: `用事${i}`, owner: 'me', due: day(3) });
  assert.ok(!codes(buildInsights(db2, NOW)).includes('overload'));
});

test('次に話すことは上限件数までしか出さない', () => {
  const db = fixture();
  for (let i = 0; i < 6; i += 1) addCommitment(db, { title: `用事${i}`, owner: 'him', due: day(i - 2) });
  const insights = buildInsights(db, NOW);
  assert.equal(insights.talkingPoints.length, db.settings.maxOpenForHim);
  // いちばん遅れているものが先頭に来る
  assert.equal(insights.talkingPoints[0].title, '用事0');
});

test('期限切れの言い方は催促ではなく日付の決め直しに誘導する', () => {
  const db = fixture();
  addCommitment(db, { title: '電話する', owner: 'him', due: day(-2), daysAgo: 5 });
  const [point] = buildInsights(db, NOW).talkingPoints;
  assert.match(point.phrase, /いつならできるか/);
  assert.ok(!point.phrase.includes('までにお願い'), '過ぎた日付をもう一度言っても動かない');
});

test('期限内の言い方には具体的な日付が入る', () => {
  const db = fixture();
  addCommitment(db, {
    title: '病院に行く',
    owner: 'him',
    due: day(2),
    steps: [{ text: '保険証を持つ' }],
  });
  const [point] = buildInsights(db, NOW).talkingPoints;
  assert.match(point.phrase, /9月21日\(月\)までにお願い/);
  assert.equal(point.nextStep, '保険証を持つ', '最初の手順は言い方と分けて渡す');
});

test('期限のないやくそくは日付を決めるよう促す', () => {
  const db = fixture();
  addCommitment(db, { title: 'そのうちやる', daysAgo: 5 });
  const insights = buildInsights(db, NOW);
  assert.ok(codes(insights).includes('no_due'));
  assert.equal(insights.summary.noDue, 1);
  assert.match(insights.talkingPoints[0].phrase, /いつやる/);
});

test('理解確認をしないまま止まっているものを名指しする', () => {
  const db = fixture();
  const i = addInteraction(db, { summary: '頼んだ', understanding: 'asked', daysAgo: 10 });
  addCommitment(db, { title: '止まっている用事', interactionId: i.id, due: day(5), daysAgo: 10 });
  assert.ok(codes(buildInsights(db, NOW)).includes('unconfirmed'));

  // 復唱まで確認できていれば出さない
  const db2 = fixture();
  const i2 = addInteraction(db2, { summary: '頼んだ', understanding: 'readback', daysAgo: 10 });
  addCommitment(db2, { title: '止まっている用事', interactionId: i2.id, due: day(5), daysAgo: 10 });
  assert.ok(!codes(buildInsights(db2, NOW)).includes('unconfirmed'));
});

test('連絡が途切れていると警告し、記録があれば出さない', () => {
  const db = fixture();
  addInteraction(db, { summary: '話した', daysAgo: 6 });
  assert.ok(codes(buildInsights(db, NOW)).includes('contact_gap'));

  addInteraction(db, { summary: '今日も話した', daysAgo: 0 });
  assert.ok(!codes(buildInsights(db, NOW)).includes('contact_gap'));
});

test('何も問題がなければ「抜け漏れなし」を返す', () => {
  const db = fixture();
  addInteraction(db, { summary: '今日話した', daysAgo: 0 });
  addCommitment(db, { title: '近日中の用事', due: day(4), daysAgo: 0 });
  const insights = buildInsights(db, NOW);
  assert.deepEqual(codes(insights), ['clear']);
  assert.equal(insights.alerts[0].level, 'good');
});

test('連続記録日数は今日未記録でも昨日までで数える', () => {
  const db = fixture();
  addInteraction(db, { summary: 'a', daysAgo: 1 });
  addInteraction(db, { summary: 'b', daysAgo: 2 });
  addInteraction(db, { summary: 'c', daysAgo: 3 });
  assert.equal(buildInsights(db, NOW).summary.recordStreak, 3);

  addInteraction(db, { summary: 'd', daysAgo: 0 });
  assert.equal(buildInsights(db, NOW).summary.recordStreak, 4);

  // 途切れていれば 0
  const db2 = fixture();
  addInteraction(db2, { summary: 'a', daysAgo: 5 });
  assert.equal(buildInsights(db2, NOW).summary.recordStreak, 0);
});

test('放置日数のバケットに振り分ける', () => {
  const db = fixture();
  addCommitment(db, { title: 'a', daysAgo: 0, due: day(1) });
  addCommitment(db, { title: 'b', daysAgo: 4, due: day(1) });
  addCommitment(db, { title: 'c', daysAgo: 9, due: day(1) });
  addCommitment(db, { title: 'd', daysAgo: 30, due: day(1) });
  addCommitment(db, { title: '完了済みは数えない', daysAgo: 30, status: 'done' });

  const buckets = buildInsights(db, NOW).agingBuckets;
  assert.deepEqual(
    buckets.map((b) => [b.label, b.count]),
    [
      ['0〜2日', 1],
      ['3〜6日', 1],
      ['7〜13日', 1],
      ['14日以上', 1],
    ],
  );
});

test('伝え方の効き目は両側に十分な件数がないと判定しない', () => {
  const db = fixture();
  const withTech = addInteraction(db, { summary: '書いて渡した', techniques: ['written'], daysAgo: 20 });
  const without = addInteraction(db, { summary: '口で言った', techniques: [], daysAgo: 20 });

  // 「あり」2件では足りない
  addCommitment(db, { title: 'w1', interactionId: withTech.id, status: 'done', daysAgo: 18 });
  addCommitment(db, { title: 'w2', interactionId: withTech.id, status: 'done', daysAgo: 18 });
  for (let i = 0; i < 3; i += 1) {
    addCommitment(db, { title: `o${i}`, interactionId: without.id, status: 'dropped', daysAgo: 18 });
  }
  let row = buildInsights(db, NOW).techniqueEffect.rows.find((r) => r.key === 'written');
  assert.equal(row.enough, false);
  assert.equal(row.delta, null);

  // 3件目を足すと比較できるようになる
  addCommitment(db, { title: 'w3', interactionId: withTech.id, status: 'done', daysAgo: 18 });
  const effect = buildInsights(db, NOW).techniqueEffect;
  row = effect.rows.find((r) => r.key === 'written');
  assert.equal(row.enough, true);
  assert.equal(row.withRate, 1);
  assert.equal(row.withoutRate, 0);
  assert.equal(row.delta, 1);
  assert.equal(effect.sampleSize, 6);
  // いちばん効いた工夫が先頭
  assert.equal(effect.rows[0].key, 'written');
});

test('未決着のやくそくは効き目の母数に入れない', () => {
  const db = fixture();
  const src = addInteraction(db, { summary: '頼んだ', techniques: ['written'], daysAgo: 5 });
  addCommitment(db, { title: 'まだ途中', interactionId: src.id, daysAgo: 5 });
  assert.equal(buildInsights(db, NOW).techniqueEffect.sampleSize, 0);
});

test('復唱は understanding から効き目の比較対象になる', () => {
  const db = fixture();
  const readback = addInteraction(db, { summary: '復唱あり', understanding: 'readback', daysAgo: 20 });
  const plain = addInteraction(db, { summary: '復唱なし', understanding: 'none', daysAgo: 20 });
  for (let i = 0; i < 3; i += 1) {
    addCommitment(db, { title: `r${i}`, interactionId: readback.id, status: 'done', daysAgo: 18 });
    addCommitment(db, { title: `p${i}`, interactionId: plain.id, status: 'dropped', daysAgo: 18 });
  }
  const row = buildInsights(db, NOW).techniqueEffect.rows.find((r) => r.key === 'readback');
  assert.equal(row.enough, true);
  assert.equal(row.delta, 1);
});

test('目標の進捗と停滞を出す', () => {
  const db = fixture();
  const goal = addGoal(db, {
    title: '週3日の仕事に慣れる',
    milestones: [{ title: '見学に行く', done: true }, { title: '体験を1日やる' }],
    daysAgo: 60,
  });
  addInteraction(db, { summary: '目標の話をした', goalId: goal.id, daysAgo: 40 });

  const p = buildInsights(db, NOW).goalProgress[0];
  assert.equal(p.ratio, 0.5);
  assert.equal(p.nextMilestone, '体験を1日やる');
  assert.equal(p.idleDays, 40);
  assert.equal(p.stalled, true);
  assert.ok(codes(buildInsights(db, NOW)).includes('goal_stalled'));

  // 直近に動きがあれば停滞ではない
  addInteraction(db, { summary: '進んだ', goalId: goal.id, daysAgo: 2 });
  const p2 = buildInsights(db, NOW).goalProgress[0];
  assert.equal(p2.stalled, false);
  assert.equal(p2.idleDays, 2);
});

test('マイルストーンがなければ紐づくやくそくで進捗を代用する', () => {
  const db = fixture();
  const goal = addGoal(db, { title: '引っ越す', daysAgo: 10 });
  addCommitment(db, { title: '物件を見る', goalId: goal.id, status: 'done', daysAgo: 5 });
  addCommitment(db, { title: '内見の予約', goalId: goal.id, daysAgo: 2, due: day(3) });

  const p = buildInsights(db, NOW).goalProgress[0];
  assert.equal(p.basis, 'commitment');
  assert.equal(p.ratio, 0.5);
});

test('週次の集計は今週と先週を分けて数える', () => {
  const db = fixture();
  // 2026-09-19 は土曜。今週は 09-14(月)〜09-20(日)
  addInteraction(db, { summary: '今週1', daysAgo: 1, condition: 4 });
  addInteraction(db, { summary: '今週2', daysAgo: 2, condition: 2 });
  addInteraction(db, { summary: '先週', daysAgo: 8 });

  const { thisWeek, lastWeek } = buildInsights(db, NOW).weekly;
  assert.equal(thisWeek.from, '2026-09-14');
  assert.equal(thisWeek.to, '2026-09-20');
  assert.equal(thisWeek.interactions, 2);
  assert.equal(thisWeek.recordedDays, 2);
  assert.equal(thisWeek.avgCondition, 3);
  assert.equal(lastWeek.interactions, 1);
});

test('ヒートマップは12週分の枠を必ず返し、未来の日を区別する', () => {
  const db = fixture();
  addInteraction(db, { summary: 'a', daysAgo: 0 });
  const heat = buildInsights(db, NOW).heatmap;
  assert.equal(heat.cells.length, 12 * 7);
  assert.equal(heat.end, '2026-09-20'); // 今週の日曜まで
  assert.equal(heat.cells.filter((c) => c.future).length, 1); // 09-20 だけ未来
  assert.equal(heat.cells.find((c) => c.day === '2026-09-19').count, 1);
});
