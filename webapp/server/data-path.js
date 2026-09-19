/**
 * 記録の保存先を決める。
 *
 * このアプリは2つの置かれ方をする。
 *   - 単体のリポジトリとして（アプリのルート＝リポジトリのルート）
 *   - 別のワークスペースの一部として（daily-coworker/webapp のような配置）
 * どちらでも同じ記録を開けるように、候補を順に見て「すでに在るもの」を選ぶ。
 *
 * 名前を変えたり置き場所を移したりしたときに、記録が見えなくなるのがいちばん困る。
 * 新しい場所が空で、古い場所に実体があるなら、迷わず古いほうを使う。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** package.json のある場所＝アプリのルート */
export const APP_ROOT = path.resolve(HERE, '..');

/** 新規に作るときの既定の保存先 */
export const DEFAULT_DATA_FILE = path.join(APP_ROOT, 'data', 'tsutae-log', 'db.json');

/**
 * 既存の保存先を探す。見つからなければ既定の場所を返す。
 * @param {{env?: NodeJS.ProcessEnv, onFallback?: (file: string) => void}} options
 */
export function resolveDataFile({ env = process.env, onFallback } = {}) {
  if (env.TSUTAE_DATA) return env.TSUTAE_DATA;
  if (env.FUTARI_DATA) return env.FUTARI_DATA; // 旧名で指定している場合

  const parent = path.resolve(APP_ROOT, '..');
  const candidates = [
    DEFAULT_DATA_FILE,
    path.join(parent, 'data', 'tsutae-log', 'db.json'), // ワークスペースに同居している配置
    path.join(parent, 'data', 'futari-log', 'db.json'), // 「ふたりログ」だった頃
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    if (file !== DEFAULT_DATA_FILE) onFallback?.(file);
    return file;
  }
  return DEFAULT_DATA_FILE;
}
