/**
 * JSON ファイル永続化。
 *
 * 依存を増やさないため DB は使わない。記録は 1 日数件、年単位でも数千件に収まるので
 * 全件をメモリに載せて読み書きする。壊れたら困るデータなので、
 *   - 書き込みは一時ファイル + rename（原子的置換）
 *   - 書き込みは直列化（同時更新で失われる更新を作らない）
 *   - 保存先は .gitignore 済みの data/ 配下（public リポジトリに個人情報を出さない）
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../shared/constants.js';

export const SCHEMA_VERSION = 1;

export function emptyDb() {
  return {
    version: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    goals: [],
    interactions: [],
    commitments: [],
  };
}

export class Store {
  #file;
  #db = null;
  #writeChain = Promise.resolve();

  constructor(file) {
    this.#file = path.resolve(file);
  }

  get file() {
    return this.#file;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.#file, 'utf8');
      this.#db = migrate(JSON.parse(raw));
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.#db = emptyDb();
        await this.#persist();
      } else if (err instanceof SyntaxError) {
        // 壊れたファイルを黙って上書きすると記録が消える。退避してから作り直す。
        const backup = `${this.#file}.broken-${Date.now()}`;
        await fs.rename(this.#file, backup);
        this.#db = emptyDb();
        await this.#persist();
        throw new Error(
          `保存ファイルが壊れていたため ${backup} に退避し、空の状態で起動しました`,
          { cause: err },
        );
      } else {
        throw err;
      }
    }
    return this.#db;
  }

  /** 読み取り専用の現在状態 */
  get db() {
    if (!this.#db) throw new Error('Store.load() を先に呼んでください');
    return this.#db;
  }

  /**
   * db を書き換えて保存する。mutator の戻り値がそのまま呼び出し元に返る。
   * 保存が失敗したらメモリ上の変更も巻き戻して、画面と実体がずれないようにする。
   */
  async mutate(mutator) {
    const run = async () => {
      const snapshot = structuredClone(this.db);
      let result;
      try {
        result = await mutator(this.#db);
      } catch (err) {
        this.#db = snapshot;
        throw err;
      }
      try {
        await this.#persist();
      } catch (err) {
        this.#db = snapshot;
        throw err;
      }
      return result;
    };
    // 直列化：前の書き込みの成否にかかわらず次を実行する
    const next = this.#writeChain.then(run, run);
    this.#writeChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** 丸ごと差し替え（インポート用） */
  async replace(nextDb) {
    return this.mutate((db) => {
      const migrated = migrate(nextDb);
      db.version = migrated.version;
      db.settings = migrated.settings;
      db.goals = migrated.goals;
      db.interactions = migrated.interactions;
      db.commitments = migrated.commitments;
      return db;
    });
  }

  async #persist() {
    await fs.mkdir(path.dirname(this.#file), { recursive: true });
    const tmp = `${this.#file}.${randomUUID()}.tmp`;
    const body = `${JSON.stringify(this.#db, null, 2)}\n`;
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, this.#file);
  }
}

/**
 * 保存済みデータを現行スキーマに合わせる。欠けたキーを埋めるほか、
 * 「ふたりログ」という名前だった頃のキー名を、現行の一般名に読み替える。
 * 古いファイルを開いても記録が消えないようにするための層。
 */
export function migrate(input) {
  const base = emptyDb();
  if (!input || typeof input !== 'object') return base;

  const rawSettings = { ...(input.settings ?? {}) };
  // 旧名 → 新名。新名が入っていればそちらを優先する。
  if (rawSettings.himName !== undefined && rawSettings.partnerName === undefined) {
    rawSettings.partnerName = rawSettings.himName;
  }
  if (rawSettings.maxOpenForHim !== undefined && rawSettings.maxOpenAtOnce === undefined) {
    rawSettings.maxOpenAtOnce = rawSettings.maxOpenForHim;
  }
  delete rawSettings.himName;
  delete rawSettings.maxOpenForHim;

  const commitments = (Array.isArray(input.commitments) ? input.commitments : []).map((c) =>
    c && c.owner === 'him' ? { ...c, owner: 'partner' } : c,
  );

  return {
    version: SCHEMA_VERSION,
    settings: { ...base.settings, ...rawSettings },
    goals: Array.isArray(input.goals) ? input.goals : [],
    interactions: Array.isArray(input.interactions) ? input.interactions : [],
    commitments,
  };
}
