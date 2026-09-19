#!/usr/bin/env node
/**
 * 動作確認用のサンプルデータを作る。
 *
 * 中身はすべて架空。実データを誤って潰さないよう、
 * 既に記録があるファイルには --force なしでは書き込まない。
 *
 *   node tools/seed.js                     # 既定の保存先に作る
 *   FUTARI_DATA=/tmp/demo.json node tools/seed.js
 *   node tools/seed.js --force             # 既存データを上書き
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as domain from '../server/domain.js';
import { Store } from '../server/store.js';
import { addDays, todayKey } from '../shared/dates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const DATA_FILE = process.env.FUTARI_DATA ?? path.join(REPO_ROOT, 'data', 'futari-log', 'db.json');
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
  domain.updateSettings(db, { himName: 'あに', myName: 'じぶん' });

  const work = domain.createGoal(
    db,
    {
      title: '週3日の仕事に慣れる',
      why: '「働いている自分」でいたい、と本人が言っている',
      targetDate: addDays(today, 120),
      milestones: [
        { title: '就労支援に見学に行く', done: true },
        { title: '体験を1日やってみる', done: true },
        { title: '週1日から始める' },
        { title: '週3日を1か月続ける' },
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

  // 何日か前から今日にかけてのやりとり。伝え方の効き目が出る程度の件数を入れてある。
  const script = [
    { daysAgo: 22, summary: '就労支援の見学について話した。行ってみたいとのこと', condition: 4, understanding: 'readback', techniques: ['one_at_a_time', 'written', 'concrete_date'], goalId: work.id,
      commitments: [{ title: '見学の日程を支援員に聞く', owner: 'me', due: addDays(today, -20), done: true }] },
    { daysAgo: 20, summary: '見学日が決まったと伝えた。カレンダーに書いてもらった', condition: 4, understanding: 'readback', techniques: ['written', 'concrete_date', 'quiet_place'], goalId: work.id,
      commitments: [{ title: '見学に行く', owner: 'both', due: addDays(today, -16), done: true }] },
    { daysAgo: 16, summary: '見学に一緒に行った。人が多くて疲れた様子', condition: 2, understanding: 'asked', friction: 'some', techniques: ['no_rush'], goalId: work.id },
    { daysAgo: 14, summary: '感想を聞いた。「やれそうだけど週3は多い」とのこと', condition: 3, understanding: 'readback', techniques: ['no_rush', 'choice'], goalId: work.id,
      commitments: [{ title: '体験を1日申し込む', owner: 'him', due: addDays(today, -10), done: true, steps: ['支援員に電話する', '「体験を1日」と言う'] }] },
    { daysAgo: 12, summary: '封筒分けの話。今週分を一緒に仕分けた', condition: 4, understanding: 'readback', techniques: ['steps', 'praise'], goalId: money.id },
    { daysAgo: 10, summary: '体験の前日。持ち物を紙に書いて渡した', condition: 3, understanding: 'readback', techniques: ['written', 'steps'], goalId: work.id },
    { daysAgo: 9, summary: '体験を1日やってきた。思ったより平気だったと話していた', condition: 5, understanding: 'asked', techniques: ['praise'], goalId: work.id },
    { daysAgo: 7, summary: '通帳の記帳をお願いしたが、口頭だけで済ませてしまった', condition: 3, understanding: 'none', techniques: [], goalId: money.id,
      commitments: [{ title: '通帳を記帳する', owner: 'him' }] },
    { daysAgo: 5, summary: '体調がよくなさそう。あまり話さなかった', condition: 2, understanding: 'none', friction: 'some' },
    { daysAgo: 3, summary: '週1日から始める件を相談。1月から週1でやってみることに', condition: 4, understanding: 'readback', techniques: ['one_at_a_time', 'choice', 'concrete_date'], goalId: work.id,
      commitments: [{ title: '支援員に「週1で始めたい」と伝える', owner: 'him', due: addDays(today, -1), steps: ['月曜の朝に電話する', '「週1日から」と言う'] }] },
    { daysAgo: 1, summary: '病院の予約の話。日付をカレンダーに書いた', condition: 4, understanding: 'readback', techniques: ['written', 'concrete_date'],
      commitments: [
        { title: '診察に行く（保険証を持つ）', owner: 'him', due: addDays(today, 4), steps: ['保険証と診察券を前の日に出しておく', '10時までに家を出る'] },
        { title: '薬局に処方せんを出す', owner: 'me', due: addDays(today, 4) },
      ] },
    { daysAgo: 2, summary: 'ゴミ出しの当番。前の日に声をかけたら自分で出せた', condition: 4, understanding: 'readback', techniques: ['written', 'praise', 'one_at_a_time'],
      commitments: [{ title: '燃えるゴミを朝に出す', owner: 'him', due: addDays(today, -2), done: true }] },
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
  domain.createCommitment(db, { title: '古い書類を片づける', owner: 'him' }, at(18));

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
        commitments: [{ title: entry.title, owner: 'him', due: addDays(today, -(entry.daysAgo - 3)) }],
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
if (!process.env.FUTARI_FROM_DEMO) {
  console.log('  npm start で http://127.0.0.1:4173 を開いてください。');
}
