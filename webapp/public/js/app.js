/**
 * 画面の入口。状態はここだけが持ち、各ビューは受け取った状態を描くだけにする。
 * 更新系 API は必ず最新の insights を返すので、書き込みのたびに全体を再取得しない。
 */

import { api } from './api.js';
import { clear, el } from './dom.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCapture } from './views/capture.js';
import { renderCommitments } from './views/commitments.js';
import { renderGoals } from './views/goals.js';
import { renderInsights } from './views/insights.js';
import { renderHandoff } from './views/handoff.js';
import { renderSettings } from './views/settings.js';

const VIEWS = [
  { key: 'today', label: '今日', render: renderDashboard },
  { key: 'capture', label: '記録する', render: renderCapture },
  { key: 'commitments', label: 'やくそく', render: renderCommitments },
  { key: 'goals', label: '目標', render: renderGoals },
  { key: 'insights', label: '見える化', render: renderInsights },
  { key: 'handoff', label: '渡すカード', render: renderHandoff },
  { key: 'settings', label: '設定', render: renderSettings },
];

const state = {
  db: null,
  insights: null,
  options: null,
  view: readHash(),
  /** ビュー内の一時的な選択（フィルタなど）。再描画でも保つ */
  ui: { commitmentFilter: 'open', highlightIds: null },
};

const ctx = {
  get state() {
    return state;
  },
  get db() {
    return state.db;
  },
  get insights() {
    return state.insights;
  },
  get options() {
    return state.options;
  },
  get settings() {
    return state.db.settings;
  },
  navigate,
  toast,
  render,
  /** 更新系 API を呼び、返ってきた最新状態を取り込んでから再描画する */
  async act(fn, successMessage) {
    try {
      const result = await fn();
      if (result?.insights) state.insights = result.insights;
      await refreshDb();
      render();
      if (successMessage) toast(successMessage);
      return result;
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  },
};

/* ------------------------------------------------------------------ */

function readHash() {
  const key = location.hash.replace(/^#\/?/, '');
  return VIEWS.some((v) => v.key === key) ? key : 'today';
}

function navigate(key, options = {}) {
  state.view = key;
  if (options.highlightIds) state.ui.highlightIds = options.highlightIds;
  if (options.commitmentFilter) state.ui.commitmentFilter = options.commitmentFilter;
  if (location.hash !== `#/${key}`) location.hash = `#/${key}`;
  else render();
  document.getElementById('view')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function refreshDb() {
  const payload = await api.getState();
  const { insights, ...db } = payload;
  state.db = db;
  state.insights = insights;
}

function renderNav() {
  const nav = clear(document.getElementById('nav'));
  const overdue = state.insights?.summary.overdue ?? 0;
  const dueToday = state.insights?.summary.dueToday ?? 0;
  for (const view of VIEWS) {
    const badgeCount = view.key === 'commitments' ? overdue + dueToday : 0;
    nav.append(
      el(
        'button',
        {
          type: 'button',
          class: 'nav__item',
          'aria-current': state.view === view.key ? 'page' : null,
          onClick: () => navigate(view.key),
        },
        view.label,
        badgeCount > 0 ? el('span', { class: 'nav__badge', text: String(badgeCount) }) : null,
      ),
    );
  }
}

function render() {
  if (!state.db) return;
  renderNav();

  const sub = document.getElementById('brand-sub');
  const s = state.insights.summary;
  sub.textContent =
    s.totalInteractions === 0
      ? 'まだ記録がありません'
      : `記録 ${s.totalInteractions}件 / 未完了 ${s.openTotal}件`;

  const host = clear(document.getElementById('view'));
  const view = VIEWS.find((v) => v.key === state.view) ?? VIEWS[0];
  try {
    host.append(view.render(ctx));
  } catch (err) {
    console.error(err);
    host.append(el('p', { class: 'empty', text: `画面の表示に失敗しました: ${err.message}` }));
  }
}

let toastTimer = null;
function toast(message, kind = 'ok') {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.className = `toast${kind === 'error' ? ' toast--error' : ''}`;
  node.dataset.show = 'true';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.dataset.show = 'false';
  }, kind === 'error' ? 5200 : 2600);
}

/* ---------- テーマ ---------- */

function initTheme() {
  const saved = localStorage.getItem('futari-log:theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current =
      document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('futari-log:theme', next);
    render();
  });
}

/* ---------- 起動 ---------- */

window.addEventListener('hashchange', () => {
  state.view = readHash();
  render();
});

initTheme();

try {
  const [, options] = await Promise.all([refreshDb(), api.getOptions()]);
  state.options = options;
  render();
} catch (err) {
  document.getElementById('view').replaceChildren(
    el('p', { class: 'empty', text: `読み込みに失敗しました: ${err.message}` }),
  );
}
