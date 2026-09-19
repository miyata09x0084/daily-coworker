import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';

async function startServer() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsutae-api-'));
  const store = new Store(path.join(dir, 'db.json'));
  await store.load();
  const server = http.createServer(createApp(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, route, body, headers = {}) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json, text, headers: res.headers };
  };

  return { base, call, store, close: () => new Promise((r) => server.close(r)) };
}

test('記録から渡すカードまでをひと通り通せる', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const goal = await srv.call('POST', '/api/goals', {
    title: '週3日の仕事に慣れる',
    milestones: [{ title: '見学に行く' }],
  });
  assert.equal(goal.status, 201);
  const goalId = goal.body.goal.id;

  const created = await srv.call('POST', '/api/interactions', {
    summary: '仕事の見学について話した',
    channel: 'face',
    condition: 4,
    understanding: 'readback',
    techniques: ['written', 'concrete_date'],
    goalId,
    commitments: [{ title: '見学に電話で申し込む', owner: 'partner', steps: [{ text: '10時すぎにかける' }] }],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.commitments.length, 1);
  assert.equal(created.body.commitments[0].goalId, goalId, 'やりとりの目標がやくそくにも引き継がれる');
  assert.ok(created.body.insights, '更新のレスポンスに最新の集計が入っている');

  const commitmentId = created.body.commitments[0].id;

  // 期限を入れて、手順を1つ終わらせる
  const patched = await srv.call('PATCH', `/api/commitments/${commitmentId}`, { due: '2030-01-10' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.commitment.due, '2030-01-10');

  const card = await srv.call('GET', '/api/handoff?nextTalkDate=2030-01-05');
  assert.equal(card.status, 200);
  assert.match(card.body.text, /見学に電話で申し込む/);
  assert.match(card.body.text, /1月10日/);
  assert.match(card.body.text, /- 10時すぎにかける/);

  const done = await srv.call('PATCH', `/api/commitments/${commitmentId}`, { status: 'done' });
  assert.equal(done.body.commitment.status, 'done');
  assert.ok(done.body.commitment.doneAt);

  const state = await srv.call('GET', '/api/state');
  assert.equal(state.body.interactions.length, 1);
  assert.equal(state.body.insights.summary.openTotal, 0);

  const review = await srv.call('GET', '/api/review?format=markdown');
  assert.match(review.headers.get('content-type'), /text\/markdown/);
  assert.match(review.text, /# ふりかえり/);
});

test('入力の誤りは400、存在しないIDは404で返す', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const bad = await srv.call('POST', '/api/interactions', { summary: '' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /必須/);

  const badEnum = await srv.call('POST', '/api/interactions', { summary: 'x', channel: 'テレパシー' });
  assert.equal(badEnum.status, 400);

  const missing = await srv.call('PATCH', '/api/commitments/ないid', { status: 'done' });
  assert.equal(missing.status, 404);

  const notFound = await srv.call('GET', '/api/そんな経路はない');
  assert.equal(notFound.status, 404);

  const brokenJson = await fetch(`${srv.base}/api/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{壊れている',
  });
  assert.equal(brokenJson.status, 400);
});

test('別オリジンからの書き込みは拒む', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const blocked = await srv.call('POST', '/api/interactions', { summary: 'x' }, { Origin: 'https://evil.example' });
  assert.equal(blocked.status, 403);

  const allowed = await srv.call('POST', '/api/interactions', { summary: 'x' }, { Origin: srv.base });
  assert.equal(allowed.status, 201);
});

test('書き出しと読み込みで往復できる', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  await srv.call('POST', '/api/interactions', { summary: '元の記録' });
  const exported = await srv.call('GET', '/api/export');
  assert.match(exported.headers.get('content-disposition'), /tsutae-log-\d{4}-\d{2}-\d{2}\.json/);

  await srv.call('POST', '/api/interactions', { summary: 'あとで消える記録' });
  const restored = await srv.call('POST', '/api/import', exported.body);
  assert.equal(restored.status, 200);

  const state = await srv.call('GET', '/api/state');
  assert.equal(state.body.interactions.length, 1);
  assert.equal(state.body.interactions[0].summary, '元の記録');
});

test('静的ファイルを配り、配信ディレクトリの外は読ませない', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const index = await srv.call('GET', '/');
  assert.equal(index.status, 200);
  assert.match(index.text, /つたえログ/);
  assert.match(index.headers.get('content-security-policy'), /default-src 'self'/);

  const shared = await srv.call('GET', '/shared/constants.js');
  assert.equal(shared.status, 200);
  assert.match(shared.headers.get('content-type'), /javascript/);

  // エンコードされた .. も含めて、上位ディレクトリには出られない
  for (const attack of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/%2e%2e/etc/passwd']) {
    const res = await fetch(`${srv.base}${attack}`);
    assert.ok(res.status === 403 || res.status === 404, `${attack} が通ってしまった (${res.status})`);
    const body = await res.text();
    assert.ok(!body.includes('"name": "tsutae-log"'), `${attack} で package.json が読めてしまった`);
  }

  const missing = await srv.call('GET', '/ないファイル.js');
  assert.equal(missing.status, 404);
});

test('設定を変えると集計のしきい値も変わる', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  for (let i = 0; i < 4; i += 1) {
    await srv.call('POST', '/api/commitments', { title: `用事${i}`, owner: 'partner' });
  }
  const before = await srv.call('GET', '/api/insights');
  assert.ok(before.body.alerts.some((a) => a.code === 'overload'));

  const updated = await srv.call('PATCH', '/api/settings', { maxOpenAtOnce: 6, partnerName: 'けんじ' });
  assert.equal(updated.status, 200);
  assert.ok(!updated.body.insights.alerts.some((a) => a.code === 'overload'));
  assert.equal(updated.body.insights.talkingPoints.length, 4, '上限が増えれば提示件数も増える');

  const bad = await srv.call('PATCH', '/api/settings', { maxOpenAtOnce: 0 });
  assert.equal(bad.status, 400);
});
