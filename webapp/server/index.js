#!/usr/bin/env node
/**
 * 起動スクリプト。
 *
 * 既定で 127.0.0.1 にだけ bind する。家族の医療・障害に関する記録を扱うので、
 * 同じ Wi-Fi の他端末からも見えない状態を初期値にしてある。
 * 別端末から使いたい場合だけ FUTARI_HOST=0.0.0.0 を明示する。
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { Store } from './store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

const PORT = Number(process.env.FUTARI_PORT ?? process.env.PORT ?? 4173);
const HOST = process.env.FUTARI_HOST ?? '127.0.0.1';
const DATA_FILE =
  process.env.FUTARI_DATA ?? path.join(REPO_ROOT, 'data', 'futari-log', 'db.json');

const store = new Store(DATA_FILE);

try {
  await store.load();
} catch (err) {
  // 壊れたファイルを退避した場合はここに来る。起動は続ける。
  console.warn(`[futari-log] ${err.message}`);
}

const server = http.createServer(createApp(store));

server.listen(PORT, HOST, () => {
  console.log('ふたりログ');
  console.log(`  画面      http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`  データ    ${store.file}`);
  if (HOST === '0.0.0.0') {
    console.log('  ⚠ 外部公開モードです。同じネットワークの他端末から見えます。');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
