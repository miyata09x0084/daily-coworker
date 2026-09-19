/** 複数の画面で使い回す部品 */

import { el } from './dom.js';
import { api } from './api.js';
import { addDays, formatJa } from '/shared/dates.js';
import { OWNERS, labelOf } from '/shared/constants.js';

export function dueBadge(commitment, derived) {
  if (commitment.status === 'done') {
    return el('span', { class: 'badge badge--good', text: `完了 ${commitment.doneAt ? formatJa(commitment.doneAt.slice(0, 10), { weekday: false }) : ''}` });
  }
  if (commitment.status === 'dropped') return el('span', { class: 'badge', text: 'やめた' });
  if (!commitment.due) return el('span', { class: 'badge', text: '期限なし' });
  const cls =
    derived.dueState === 'overdue'
      ? 'badge badge--overdue'
      : derived.dueState === 'today'
        ? 'badge badge--today'
        : derived.dueState === 'soon'
          ? 'badge badge--soon'
          : 'badge';
  // 表示文言はサーバーの集計結果をそのまま使う。画面ごとに日付計算をやり直さない。
  return el('span', { class: cls, text: derived.dueLabel });
}

export function ownerBadge(owner) {
  return el('span', { class: 'badge', text: labelOf(OWNERS, owner) });
}

/**
 * やくそく1件のカード。
 * 操作は「できた」「もう一度伝えた」「期限を決める／延ばす」に絞ってある。
 * 一覧でいちばん頻度が高い3操作を、開かずに押せる位置に置くための判断。
 */
export function commitmentItem(ctx, c, { showSource = false } = {}) {
  const d = ctx.insights.derived[c.id];
  const isOpen = c.status === 'open';
  const stateClass = !isOpen
    ? ' item--done'
    : c.due === null
      ? ' item--nodue'
      : d.dueState === 'overdue'
        ? ' item--overdue'
        : d.dueState === 'today'
          ? ' item--today'
          : d.dueState === 'soon'
            ? ' item--soon'
            : '';

  const source = showSource && c.interactionId
    ? ctx.db.interactions.find((i) => i.id === c.interactionId)
    : null;
  const goal = c.goalId ? ctx.db.goals.find((g) => g.id === c.goalId) : null;

  const steps = c.steps.length
    ? el(
        'ul',
        { class: 'steps' },
        ...c.steps.map((step) =>
          el(
            'li',
            { class: step.done ? 'done' : null },
            el('input', {
              type: 'checkbox',
              checked: step.done,
              'aria-label': `手順: ${step.text}`,
              onChange: (e) => {
                const next = c.steps.map((s) => (s.id === step.id ? { ...s, done: e.target.checked } : s));
                ctx.act(() => api.updateCommitment(c.id, { steps: next }));
              },
            }),
            el('span', { text: step.text }),
          ),
        ),
      )
    : null;

  const meta = el(
    'div',
    { class: 'item__meta' },
    el('span', { text: `${d.ageDays}日前から` }),
    d.remindCount ? el('span', { text: `伝え直し ${d.remindCount}回` }) : null,
    d.stepsTotal ? el('span', { text: `手順 ${d.stepsDone}/${d.stepsTotal}` }) : null,
    goal ? el('span', { text: `目標: ${goal.title}` }) : null,
    source ? el('span', { text: `きっかけ: ${source.summary.slice(0, 28)}` }) : null,
  );

  const actions = isOpen
    ? el(
        'div',
        { class: 'row', style: { marginTop: '10px' } },
        el('button', {
          class: 'btn btn--sm btn--primary',
          type: 'button',
          text: 'できた',
          onClick: () => ctx.act(() => api.updateCommitment(c.id, { status: 'done' }), 'できた！を記録しました'),
        }),
        el('button', {
          class: 'btn btn--sm',
          type: 'button',
          text: 'もう一度伝えた',
          title: '同じことを伝え直した回数を数えます。3回を超えたら伝え方を変える合図です',
          onClick: () => ctx.act(() => api.updateCommitment(c.id, { addReminder: true }), '伝え直しを記録しました'),
        }),
        dueEditor(ctx, c),
        el('button', {
          class: 'btn btn--sm btn--ghost btn--danger',
          type: 'button',
          text: 'やめる',
          onClick: () => {
            if (!confirm(`「${c.title}」を取り下げますか？`)) return;
            ctx.act(() => api.updateCommitment(c.id, { status: 'dropped' }), '取り下げました');
          },
        }),
      )
    : el(
        'div',
        { class: 'row', style: { marginTop: '8px' } },
        el('button', {
          class: 'btn btn--sm btn--ghost',
          type: 'button',
          text: 'まだ終わっていない',
          onClick: () => ctx.act(() => api.updateCommitment(c.id, { status: 'open' }), '未完了に戻しました'),
        }),
        el('button', {
          class: 'btn btn--sm btn--ghost btn--danger',
          type: 'button',
          text: '削除',
          onClick: () => {
            if (!confirm(`「${c.title}」を削除しますか？`)) return;
            ctx.act(() => api.deleteCommitment(c.id), '削除しました');
          },
        }),
      );

  return el(
    'article',
    { class: `item${stateClass}` },
    el(
      'div',
      { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-start' } },
      el('div', { class: 'item__title', text: c.title }),
      el('div', { class: 'row', style: { gap: '4px' } }, ownerBadge(c.owner), dueBadge(c, d)),
    ),
    meta,
    steps,
    actions,
  );
}

/** 期限を押すだけで決められるようにする。「そのうち」を残さないための導線 */
function dueEditor(ctx, c) {
  const today = ctx.insights.today;
  const wrap = el('span', { class: 'row', style: { gap: '4px' } });
  const input = el('input', {
    type: 'date',
    value: c.due ?? '',
    'aria-label': '期限',
    style: { width: '150px', padding: '4px 8px', fontSize: '0.83rem' },
    onChange: (e) => ctx.act(() => api.updateCommitment(c.id, { due: e.target.value || null }), '期限を変えました'),
  });
  const quick = (label, days) =>
    el('button', {
      type: 'button',
      class: 'chip chip--sm',
      text: label,
      onClick: () => ctx.act(() => api.updateCommitment(c.id, { due: addDays(today, days) }), '期限を変えました'),
    });
  wrap.append(input, quick('今日', 0), quick('明日', 1), quick('3日後', 3), quick('来週', 7));
  return wrap;
}

export function emptyState(text) {
  return el('p', { class: 'empty', text });
}

export function alertRow(alert, onJump) {
  const icon = { critical: '■', serious: '▲', warning: '●', good: '✓' }[alert.level] ?? '・';
  return el(
    'div',
    { class: `alert alert--${alert.level}` },
    el('span', { class: 'alert__icon', text: icon, 'aria-hidden': 'true' }),
    el(
      'div',
      {},
      el('div', { class: 'alert__title', text: alert.title }),
      el('div', { class: 'alert__detail', text: alert.detail }),
      alert.ids?.length && onJump
        ? el('button', {
            type: 'button',
            class: 'btn btn--sm btn--ghost',
            style: { marginTop: '4px', paddingLeft: '0' },
            text: '該当をみる →',
            onClick: () => onJump(alert),
          })
        : null,
    ),
  );
}

export async function copyText(ctx, text, message = 'コピーしました') {
  try {
    await navigator.clipboard.writeText(text);
    ctx.toast(message);
  } catch {
    // localhost 以外や権限拒否では clipboard API が使えない。選択状態にして手動コピーに逃がす。
    const ta = el('textarea', { value: text, style: { position: 'fixed', top: '-1000px' } });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    ctx.toast(ok ? message : 'コピーできませんでした。手で選択してください', ok ? 'ok' : 'error');
  }
}
