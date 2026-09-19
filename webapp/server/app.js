/**
 * HTTP レイヤ。依存ゼロで済ませたいので node:http を直接使う。
 *
 * 扱うのは障害・通院・家族関係を含む個人情報なので、
 *   - 既定で 127.0.0.1 にしか bind しない（index.js 側）
 *   - 外部への通信を一切しない（CSP で self のみ許可）
 *   - 書き込み系は同一オリジンからのみ受ける（Origin チェック）
 * を守る。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as domain from './domain.js';
import { buildHandoffCard, buildWeeklyReview } from './handoff.js';
import { buildInsights } from './insights.js';
import { isDayKey, todayKey } from '../shared/dates.js';
import { CHANNELS, CONDITIONS, FRICTIONS, OWNERS, TECHNIQUES, UNDERSTANDING_LEVELS } from '../shared/constants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP_ROOT = path.resolve(HERE, '..');
const PUBLIC_DIR = path.join(WEBAPP_ROOT, 'public');
const SHARED_DIR = path.join(WEBAPP_ROOT, 'shared');
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

export function createApp(store) {
  return async function handle(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('Content-Security-Policy', CSP);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');

      if (url.pathname.startsWith('/api/')) {
        await handleApi(store, req, res, url);
        return;
      }
      await serveStatic(req, res, url);
    } catch (err) {
      sendError(res, err);
    }
  };
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

async function handleApi(store, req, res, url) {
  const method = req.method ?? 'GET';
  const route = url.pathname.replace(/^\/api/, '') || '/';

  if (method !== 'GET' && method !== 'HEAD') {
    // ローカル専用アプリなので Cookie 認証はないが、
    // 他サイトのページから書き換えられないよう Origin は確かめる。
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers.host;
      let ok = false;
      try {
        ok = new URL(origin).host === host;
      } catch {
        ok = false;
      }
      if (!ok) {
        sendJson(res, 403, { error: '別のオリジンからの書き込みは受け付けません' });
        return;
      }
    }
  }

  const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(req);
  const match = (pattern) => matchRoute(pattern, route);

  // --- 参照系 -------------------------------------------------------
  if (method === 'GET' && route === '/state') {
    const db = store.db;
    sendJson(res, 200, { ...db, insights: buildInsights(db) });
    return;
  }

  if (method === 'GET' && route === '/insights') {
    sendJson(res, 200, buildInsights(store.db));
    return;
  }

  if (method === 'GET' && route === '/options') {
    sendJson(res, 200, {
      channels: CHANNELS,
      conditions: CONDITIONS,
      understanding: UNDERSTANDING_LEVELS,
      frictions: FRICTIONS,
      techniques: TECHNIQUES,
      owners: OWNERS,
    });
    return;
  }

  if (method === 'GET' && route === '/handoff') {
    const db = store.db;
    const insights = buildInsights(db);
    const nextTalkDate = url.searchParams.get('nextTalkDate');
    if (nextTalkDate && !isDayKey(nextTalkDate)) {
      throw new domain.ValidationError('nextTalkDate は YYYY-MM-DD 形式で指定してください');
    }
    const card = buildHandoffCard(db, insights, {
      nextTalkDate: nextTalkDate || null,
      includeMine: url.searchParams.get('includeMine') !== 'false',
    });
    sendJson(res, 200, card);
    return;
  }

  if (method === 'GET' && route === '/review') {
    const db = store.db;
    const markdown = buildWeeklyReview(db, buildInsights(db));
    if (url.searchParams.get('format') === 'markdown') {
      sendText(res, 200, markdown, 'text/markdown; charset=utf-8');
    } else {
      sendJson(res, 200, { markdown });
    }
    return;
  }

  if (method === 'GET' && route === '/export') {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="futari-log-${todayKey(store.db.settings.tz)}.json"`,
    );
    sendJson(res, 200, store.db);
    return;
  }

  // --- 更新系 -------------------------------------------------------
  if (method === 'POST' && route === '/interactions') {
    const result = await store.mutate((db) => domain.createInteraction(db, body));
    sendJson(res, 201, withInsights(store, result));
    return;
  }

  let m;
  if ((m = match('/interactions/:id'))) {
    if (method === 'PATCH') {
      const updated = await store.mutate((db) => domain.updateInteraction(db, m.id, body));
      sendJson(res, 200, withInsights(store, { interaction: updated }));
      return;
    }
    if (method === 'DELETE') {
      await store.mutate((db) => domain.deleteInteraction(db, m.id));
      sendJson(res, 200, withInsights(store, { deleted: m.id }));
      return;
    }
  }

  if (method === 'POST' && route === '/commitments') {
    const created = await store.mutate((db) => domain.createCommitment(db, body));
    sendJson(res, 201, withInsights(store, { commitment: created }));
    return;
  }

  if ((m = match('/commitments/:id'))) {
    if (method === 'PATCH') {
      const updated = await store.mutate((db) => domain.updateCommitment(db, m.id, body));
      sendJson(res, 200, withInsights(store, { commitment: updated }));
      return;
    }
    if (method === 'DELETE') {
      await store.mutate((db) => domain.deleteCommitment(db, m.id));
      sendJson(res, 200, withInsights(store, { deleted: m.id }));
      return;
    }
  }

  if (method === 'POST' && route === '/goals') {
    const created = await store.mutate((db) => domain.createGoal(db, body));
    sendJson(res, 201, withInsights(store, { goal: created }));
    return;
  }

  if ((m = match('/goals/:id'))) {
    if (method === 'PATCH') {
      const updated = await store.mutate((db) => domain.updateGoal(db, m.id, body));
      sendJson(res, 200, withInsights(store, { goal: updated }));
      return;
    }
    if (method === 'DELETE') {
      await store.mutate((db) => domain.deleteGoal(db, m.id));
      sendJson(res, 200, withInsights(store, { deleted: m.id }));
      return;
    }
  }

  if (method === 'PATCH' && route === '/settings') {
    const updated = await store.mutate((db) => domain.updateSettings(db, body));
    sendJson(res, 200, withInsights(store, { settings: updated }));
    return;
  }

  if (method === 'POST' && route === '/import') {
    if (!body || typeof body !== 'object') throw new domain.ValidationError('JSON を送ってください');
    await store.replace(body);
    sendJson(res, 200, withInsights(store, { imported: true }));
    return;
  }

  sendJson(res, 404, { error: `見つかりません: ${method} ${url.pathname}` });
}

/** 更新のたびに最新の集計を返す。画面側で再取得しなくても数字がずれない */
function withInsights(store, payload) {
  return { ...payload, insights: buildInsights(store.db) };
}

function matchRoute(pattern, pathname) {
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new domain.ValidationError('データが大きすぎます');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new domain.ValidationError('JSON として読めませんでした');
  }
}

/* ------------------------------------------------------------------ *
 * 静的ファイル
 * ------------------------------------------------------------------ */

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: '許可されていないメソッドです' });
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  let baseDir = PUBLIC_DIR;
  if (rel.startsWith('/shared/')) {
    baseDir = SHARED_DIR;
    rel = rel.slice('/shared'.length);
  }
  if (rel === '/' || rel === '') rel = '/index.html';

  const target = path.join(baseDir, rel);
  // パストラバーサル対策：解決後のパスが配信ディレクトリの中に収まっていること
  const resolved = path.resolve(target);
  if (resolved !== baseDir && !resolved.startsWith(baseDir + path.sep)) {
    sendJson(res, 403, { error: '許可されていないパスです' });
    return;
  }

  try {
    const data = await fs.readFile(resolved);
    const type = MIME[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      sendText(res, 404, 'Not Found');
      return;
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  const body = Buffer.from(text, 'utf8');
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length });
  res.end(body);
}

function sendError(res, err) {
  const status = Number.isInteger(err?.status) ? err.status : 500;
  if (status === 500) console.error('[futari-log]', err);
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, status, { error: err?.message ?? 'サーバーエラー' });
}
