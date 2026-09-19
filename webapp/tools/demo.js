#!/usr/bin/env node
/**
 * 動作確認用のワンコマンド起動。
 *
 *   npm run demo              # 自分のパソコンだけで見る
 *   npm run demo -- --lan     # 同じWi-Fiのスマホからも見る
 *
 * 架空のサンプルデータを一時ファイルに作り、それを指したままサーバーを起動する。
 * 本物の記録（data/futari-log/db.json）には一切触らない。
 * 試したあとで本番を始めるときは、ふつうに `npm start` すれば空の状態から入れる。
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP = path.resolve(HERE, '..');
const DEMO_FILE = path.join(os.tmpdir(), 'futari-log-demo.json');

const lan = process.argv.includes('--lan');
const port = process.env.FUTARI_PORT ?? '4173';
const env = {
  ...process.env,
  FUTARI_DATA: DEMO_FILE,
  FUTARI_PORT: port,
  FUTARI_FROM_DEMO: '1',
  ...(lan ? { FUTARI_HOST: '0.0.0.0' } : {}),
};

const run = (script, args = []) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(WEBAPP, script), ...args], {
      cwd: WEBAPP,
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} が終了コード ${code} で終わりました`))));
  });

console.log('サンプルデータ（架空）を用意しています…\n');
await run('tools/seed.js', ['--force']);

if (lan) {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

  console.log('\nスマホからは、同じWi-Fiにつないで次のどれかを開いてください:');
  if (addresses.length === 0) {
    console.log('  （このマシンのLAN内アドレスが見つかりませんでした。Wi-Fi接続を確認してください）');
  } else {
    for (const address of addresses) console.log(`  http://${address}:${port}`);
  }
  console.log('\n⚠ 認証はありません。同じWi-Fiにいる端末からは誰でも中身を読めます。');
  console.log('  自宅など、つないでいる人が分かっているネットワークでだけ使ってください。');
}

console.log('\n止めるときは Ctrl+C\n');
await run('server/index.js');
