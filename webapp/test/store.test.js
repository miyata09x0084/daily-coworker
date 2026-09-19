import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Store, emptyDb, migrate } from '../server/store.js';

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsutae-'));
  return path.join(dir, 'nested', 'db.json');
}

test('ファイルがなければ作って空の状態から始める', async () => {
  const file = await tmpFile();
  const store = new Store(file);
  await store.load();
  assert.deepEqual(store.db.goals, []);
  const written = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(written.version, 1);
});

test('書き込みは保存され、読み直しても残る', async () => {
  const file = await tmpFile();
  const store = new Store(file);
  await store.load();
  await store.mutate((db) => {
    db.goals.push({ id: 'g1', title: '引っ越す' });
  });

  const reopened = new Store(file);
  await reopened.load();
  assert.equal(reopened.db.goals[0].title, '引っ越す');
});

test('保存が失敗したらメモリ上の変更も巻き戻す', async () => {
  const file = await tmpFile();
  const store = new Store(file);
  await store.load();

  // 保存先をディレクトリにして書き込みを失敗させる
  await fs.rm(file);
  await fs.mkdir(file, { recursive: true });

  await assert.rejects(() =>
    store.mutate((db) => {
      db.goals.push({ id: 'x', title: '失敗するはず' });
    }),
  );
  assert.equal(store.db.goals.length, 0, '画面に見えている状態とファイルがずれてはいけない');
});

test('mutator が投げたら状態は変わらない', async () => {
  const file = await tmpFile();
  const store = new Store(file);
  await store.load();
  await assert.rejects(() =>
    store.mutate((db) => {
      db.goals.push({ id: 'x' });
      throw new Error('検証エラー');
    }),
  );
  assert.equal(store.db.goals.length, 0);
});

test('同時に書き込んでも更新が失われない', async () => {
  const file = await tmpFile();
  const store = new Store(file);
  await store.load();

  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      store.mutate((db) => {
        db.goals.push({ id: `g${i}` });
      }),
    ),
  );

  const reopened = new Store(file);
  await reopened.load();
  assert.equal(reopened.db.goals.length, 20);
});

test('壊れたファイルは退避してから作り直す', async () => {
  const file = await tmpFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '{ これはJSONではない', 'utf8');

  const store = new Store(file);
  await assert.rejects(() => store.load(), /退避/);
  assert.deepEqual(store.db.interactions, []);

  const files = await fs.readdir(path.dirname(file));
  assert.ok(files.some((f) => f.includes('.broken-')), '元のファイルは消さずに残す');
});

test('欠けたキーは既定値で埋める', () => {
  const migrated = migrate({ interactions: [{ id: 'a' }] });
  assert.equal(migrated.goals.length, 0);
  assert.equal(migrated.settings.maxOpenAtOnce, emptyDb().settings.maxOpenAtOnce);
  assert.equal(migrated.interactions.length, 1);
  assert.deepEqual(migrate(null).commitments, []);
});

test('「ふたりログ」時代のファイルを開いても記録が消えない', () => {
  const legacy = {
    settings: { himName: 'あに', myName: 'じぶん', maxOpenForHim: 5, staleDays: 7 },
    commitments: [
      { id: 'c1', title: '電話する', owner: 'him' },
      { id: 'c2', title: '調べる', owner: 'me' },
    ],
    interactions: [{ id: 'i1' }],
  };
  const migrated = migrate(legacy);

  assert.equal(migrated.settings.partnerName, 'あに', '呼び名は引き継ぐ');
  assert.equal(migrated.settings.maxOpenAtOnce, 5, 'しきい値も引き継ぐ');
  assert.equal(migrated.settings.himName, undefined, '旧キーは残さない');
  assert.equal(migrated.settings.maxOpenForHim, undefined);
  assert.equal(migrated.commitments[0].owner, 'partner', '担当の値を読み替える');
  assert.equal(migrated.commitments[1].owner, 'me', '他の値はそのまま');
  assert.equal(migrated.interactions.length, 1);
});

test('新しいキーが入っていれば、旧キーより優先する', () => {
  const migrated = migrate({
    settings: { himName: '旧', partnerName: '新', maxOpenForHim: 9, maxOpenAtOnce: 2 },
  });
  assert.equal(migrated.settings.partnerName, '新');
  assert.equal(migrated.settings.maxOpenAtOnce, 2);
});
