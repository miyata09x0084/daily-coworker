#!/usr/bin/env node
/**
 * 起動スクリプト。
 *
 * 既定で 127.0.0.1 にだけ bind する。家庭や職場の込み入った事情がそのまま残る記録なので、
 * 同じ Wi-Fi の他端末からも見えない状態を初期値にしてある。
 * 別端末から使いたい場合だけ TSUTAE_HOST=0.0.0.0 を明示する。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { Store } from './store.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

const PORT = Number(process.env.TSUTAE_PORT ?? process.env.PORT ?? 4173);
const HOST = process.env.TSUTAE_HOST ?? '127.0.0.1';

/**
 * 保存先。「ふたりログ」という名前だった頃のファイルが残っていて、
 * 新しい場所がまだ空なら、古いほうをそのまま使う。
 * 名前を変えただけで記録が見えなくなるのがいちばん困るため。
 */
function resolveDataFile() {
  if (process.env.TSUTAE_DATA) return process.env.TSUTAE_DATA;
  if (process.env.FUTARI_DATA) return process.env.FUTARI_DATA;
  const current = path.join(REPO_ROOT, 'data', 'tsutae-log', 'db.json');
  const legacy = path.join(REPO_ROOT, 'data', 'futari-log', 'db.json');
  if (!fs.existsSync(current) && fs.existsSync(legacy)) {
    console.log(`[tsutae-log] 以前の保存先をそのまま使います: ${legacy}`);
    return legacy;
  }
  return current;
}

const DATA_FILE = resolveDataFile();

const store = new Store(DATA_FILE);

try {
  await store.load();
} catch (err) {
  // 壊れたファイルを退避した場合はここに来る。起動は続ける。
  console.warn(`[tsutae-log] ${err.message}`);
}

const server = http.createServer(createApp(store));

server.listen(PORT, HOST, () => {
  console.log('つたえログ');
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
