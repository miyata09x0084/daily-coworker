#!/usr/bin/env node
/**
 * 動作確認用のサンプルデータを作る。
 *
 * 中身はすべて架空。実データを誤って潰さないよう、
 * 既に記録があるファイルには --force なしでは書き込まない。
 *
 *   node tools/seed.js                     # 既定の保存先に作る
 *   TSUTAE_DATA=/tmp/demo.json node tools/seed.js
 *   node tools/seed.js --force             # 既存データを上書き
 */

import * as domain from '../server/domain.js';
import { resolveDataFile } from '../server/data-path.js';
import { Store } from '../server/store.js';
import { addDays, todayKey } from '../shared/dates.js';

const DATA_FILE = resolveDataFile();
const force = process.argv.includes('--force');

const TZ = 'Asia/Tokyo';
const today = todayKey(TZ);
const at = (daysAgo, hour = 19) => new Date(`${addDays(today, -daysAgo)}T${String(hour).padStart(2, '0')}:00:00+09:00`);

const store = new Store(DATA_FILE);
await store.load();

if (!force && (store.db.interactions.length || store.db.commitments.length || store.db.goals.length)) {
  console.error(`すでに記録があります: ${store.file}`);
  console.error('上書きしてよければ --force を付けて実行してください。');
  process.exit(1);
}

await store.mutate((db) => {
  db.goals = [];
  db.interactions = [];
  db.commitments = [];

  // 架空の呼び名。既定のままだとカードが「相手へ」になって、見本として読みにくいため
  domain.updateSettings(db, { partnerName: 'ゆう', myName: '自分' });

  const move = domain.createGoal(
    db,
    {
      title: 'ひとり暮らしの準備を終える',
      why: '自分のペースで暮らせるようにしたい、と本人が言っている',
      targetDate: addDays(today, 120),
      milestones: [
        { title: '物件を3件見る', done: true },
        { title: '契約に必要な書類をそろえる', done: true },
        { title: '引っ越しの日を決める' },
        { title: '住所変更の手続きを終える' },
      ],
    },
    at(90),
  );

  const money = domain.createGoal(
    db,
    {
      title: 'お金の管理を自分でできるようにする',
      why: '月末に足りなくなって不安になることを減らしたい',
      milestones: [{ title: '週ごとの封筒分けを続ける' }, { title: '通帳記帳を月1回する' }],
    },
    at(60),
  );

  // 直近3週間のやりとり。伝え方の効き目が出る程度の件数を入れてある。
  const script = [
    { daysAgo: 22, summary: '部屋を見に行く話をした。行ってみたいとのこと', condition: 4, understanding: 'readback', techniques: ['one_at_a_time', 'written', 'concrete_date'], goalId: move.id,
      commitments: [{ title: '内見の候補日を不動産屋に聞く', owner: 'me', due: addDays(today, -20), done: true }] },
    { daysAgo: 20, summary: '内見の日が決まったと伝えた。カレンダーに書いてもらった', condition: 4, understanding: 'readback', techniques: ['written', 'concrete_date', 'quiet_place'], goalId: move.id,
      commitments: [{ title: '内見に行く', owner: 'both', due: addDays(today, -16), done: true }] },
    { daysAgo: 16, summary: '3件まわった。移動が多くて疲れた様子', condition: 2, understanding: 'asked', friction: 'some', techniques: ['no_rush'], goalId: move.id },
    { daysAgo: 14, summary: '感想を聞いた。「2件目がよかった。でも駅から遠い」とのこと', condition: 3, understanding: 'readback', techniques: ['no_rush', 'choice'], goalId: move.id,
      commitments: [{ title: '住民票を取りに行く', owner: 'partner', due: addDays(today, -10), done: true, steps: ['平日の午前に行く', '窓口で「住民票がほしい」と言う'] }] },
    { daysAgo: 12, summary: '封筒分けの話。今週分を一緒に仕分けた', condition: 4, understanding: 'readback', techniques: ['steps', 'praise'], goalId: money.id },
    { daysAgo: 10, summary: '手続きの前日。持ち物を紙に書いて渡した', condition: 3, understanding: 'readback', techniques: ['written', 'steps'], goalId: move.id },
    { daysAgo: 9, summary: '書類を全部そろえて持ってきた。思ったより早かった', condition: 5, understanding: 'asked', techniques: ['praise'], goalId: move.id },
    { daysAgo: 7, summary: '通帳の記帳をお願いしたが、口頭だけで済ませてしまった', condition: 3, understanding: 'none', techniques: [], goalId: money.id,
      commitments: [{ title: '通帳を記帳する', owner: 'partner' }] },
    { daysAgo: 5, summary: '疲れていそうだったので、用件は出さなかった', condition: 2, understanding: 'none', friction: 'some' },
    { daysAgo: 3, summary: '引っ越しの日を相談。来月の第2土曜でいったん置くことに', condition: 4, understanding: 'readback', techniques: ['one_at_a_time', 'choice', 'concrete_date'], goalId: move.id,
      commitments: [{ title: '不動産屋に「第2土曜で」と電話する', owner: 'partner', due: addDays(today, -1), steps: ['月曜の朝に電話する', '「第2土曜に入りたい」と言う'] }] },
    { daysAgo: 2, summary: 'ゴミ出しの当番。前の日に声をかけたら自分で出せた', condition: 4, understanding: 'readback', techniques: ['written', 'praise', 'one_at_a_time'],
      commitments: [{ title: '燃えるゴミを朝に出す', owner: 'partner', due: addDays(today, -2), done: true }] },
    { daysAgo: 1, summary: '病院の予約の話。日付をカレンダーに書いた', condition: 4, understanding: 'readback', techniques: ['written', 'concrete_date'],
      commitments: [
        { title: '診察に行く（保険証を持つ）', owner: 'partner', due: addDays(today, 4), steps: ['保険証と診察券を前の日に出しておく', '10時までに家を出る'] },
        { title: '薬局に処方せんを出す', owner: 'me', due: addDays(today, 4) },
      ] },
    { daysAgo: 0, summary: '今日は軽く様子を聞いただけ', condition: 4, understanding: 'none', techniques: ['praise'] },
  ];

  for (const entry of script) {
    const when = at(entry.daysAgo);
    const { commitments } = domain.createInteraction(
      db,
      {
        occurredAt: when.toISOString(),
        summary: entry.summary,
        channel: entry.daysAgo % 4 === 1 ? 'line' : 'face',
        condition: entry.condition,
        understanding: entry.understanding ?? 'none',
        friction: entry.friction ?? 'none',
        techniques: entry.techniques ?? [],
        goalId: entry.goalId ?? null,
        commitments: (entry.commitments ?? []).map((c) => ({
          title: c.title,
          owner: c.owner,
          due: c.due ?? null,
          steps: (c.steps ?? []).map((text) => ({ text })),
        })),
      },
      when,
    );
    (entry.commitments ?? []).forEach((spec, index) => {
      if (spec.done) domain.updateCommitment(db, commitments[index].id, { status: 'done' }, when);
    });
  }

  // 期限のないまま放置されている1件（警告の見本）
  domain.createCommitment(db, { title: '古い書類を片づける', owner: 'partner' }, at(18));

  // 「伝え方の効き目」が出るだけの決着済みデータ。
  // 書いて渡した回は終わり、口で言っただけの回は流れた、という現実によくある形にしてある。
  const older = [
    { daysAgo: 58, written: true, done: true, title: '燃えるゴミを出す' },
    { daysAgo: 55, written: false, done: false, title: '床屋に行く' },
    { daysAgo: 52, written: true, done: true, title: '定期券を買う' },
    { daysAgo: 49, written: false, done: false, title: '部屋の片づけ' },
    { daysAgo: 46, written: true, done: true, title: '電気代の支払い' },
    { daysAgo: 43, written: false, done: true, title: '買い物メモを持つ' },
    { daysAgo: 40, written: true, done: true, title: '診察の予約を取る' },
    { daysAgo: 37, written: false, done: false, title: '返却する本をまとめる' },
    { daysAgo: 34, written: true, done: false, title: '年賀状を書く' },
    { daysAgo: 31, written: false, done: false, title: '写真を整理する' },
  ];

  for (const entry of older) {
    const when = at(entry.daysAgo);
    const { commitments } = domain.createInteraction(
      db,
      {
        occurredAt: when.toISOString(),
        summary: entry.written ? `${entry.title}を紙に書いて渡した` : `${entry.title}を口で伝えた`,
        channel: 'face',
        condition: 3 + (entry.daysAgo % 3) - 1,
        understanding: entry.written ? 'readback' : 'asked',
        techniques: entry.written ? ['written', 'concrete_date', 'one_at_a_time'] : [],
        commitments: [{ title: entry.title, owner: 'partner', due: addDays(today, -(entry.daysAgo - 3)) }],
      },
      when,
    );
    domain.updateCommitment(
      db,
      commitments[0].id,
      { status: entry.done ? 'done' : 'dropped', dropReason: entry.done ? '' : 'そのままになった' },
      at(entry.daysAgo - 3),
    );
  }
});

console.log(`サンプルデータを作りました: ${store.file}`);
// demo.js から呼ばれたときは、そのまま続けて起動するので案内を重ねない
if (!process.env.TSUTAE_FROM_DEMO) {
  console.log('  npm start で http://127.0.0.1:4173 を開いてください。');
}
