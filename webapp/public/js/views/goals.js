/**
 * 「目標」画面。
 *
 * 長期目標が進まないのは、意志ではなく距離の問題であることが多い。
 * だからこの画面は「目標」と「今週の一歩」を必ず同じ高さに並べ、
 * 何日動いていないかを常に見せる。進捗バーだけでは停滞に気づけない。
 */

import { api } from '../api.js';
import { el, field } from '../dom.js';
import { emptyState } from '../components.js';
import { formatJa } from '/shared/dates.js';

export function renderGoals(ctx) {
  const progressById = new Map(ctx.insights.goalProgress.map((g) => [g.goalId, g]));
  const goals = [...ctx.db.goals].sort((a, b) => {
    const rank = { active: 0, paused: 1, achieved: 2 };
    return rank[a.status] - rank[b.status];
  });

  const host = el('div', {});
  if (goals.length === 0) {
    host.append(emptyState('まだ目標がありません。下のフォームから1つ登録してください。'));
  }
  for (const goal of goals) {
    host.append(goalCard(ctx, goal, progressById.get(goal.id)));
  }

  return el('div', {}, host, newGoalCard(ctx));
}

function goalCard(ctx, goal, p) {
  const pct = Math.round((p?.ratio ?? 0) * 100);
  const linkedOpen = ctx.db.commitments.filter((c) => c.goalId === goal.id && c.status === 'open');

  const milestones = el(
    'ul',
    { class: 'steps', style: { marginTop: '10px' } },
    ...goal.milestones.map((m) =>
      el(
        'li',
        { class: m.done ? 'done' : null },
        el('input', {
          type: 'checkbox',
          checked: m.done,
          'aria-label': `マイルストーン: ${m.title}`,
          onChange: (e) => {
            const next = goal.milestones.map((x) =>
              x.id === m.id ? { ...x, done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : null } : x,
            );
            ctx.act(() => api.updateGoal(goal.id, { milestones: next }), e.target.checked ? '1つ進みました' : '戻しました');
          },
        }),
        el('span', { text: m.title + (m.due ? `（${formatJa(m.due, { weekday: false })}）` : '') }),
      ),
    ),
  );

  const addMilestone = el('input', {
    type: 'text',
    placeholder: '＋ 次の一歩を足す（Enter）',
    style: { marginTop: '8px' },
    onKeyDown: (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      e.preventDefault();
      const next = [...goal.milestones, { title: e.target.value.trim() }];
      ctx.act(() => api.updateGoal(goal.id, { milestones: next }), '足しました');
    },
  });

  return el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'card__head' },
      el('h2', { text: goal.title }),
      el(
        'div',
        { class: 'row', style: { gap: '4px' } },
        goal.status !== 'active' ? el('span', { class: 'badge', text: goal.status === 'achieved' ? '達成' : '休止' }) : null,
        p?.stalled ? el('span', { class: 'badge badge--overdue', text: '停滞' }) : null,
        goal.targetDate
          ? el('span', {
              class: 'badge',
              text: `${formatJa(goal.targetDate, { weekday: false })}まで${p?.daysLeft !== null ? `・あと${p.daysLeft}日` : ''}`,
            })
          : null,
      ),
    ),
    goal.why ? el('p', { style: { color: 'var(--ink-2)', fontSize: '0.9rem' }, text: goal.why }) : null,

    el(
      'div',
      { class: 'row', style: { gap: '10px', alignItems: 'center' } },
      el('div', { style: { flex: '1 1 160px' }, class: 'meter' }, el('div', { class: 'meter__fill', style: { width: `${pct}%` } })),
      el('span', { style: { fontVariantNumeric: 'tabular-nums', fontWeight: '650' }, text: `${pct}%` }),
    ),
    el(
      'div',
      { class: 'item__meta', style: { marginTop: '6px' } },
      el('span', {
        text: p?.basis === 'milestone' ? `一歩 ${p.milestoneDone}/${p.milestoneTotal}` : p?.basis === 'commitment' ? `やくそく ${p.doneCount}/${p.doneCount + p.openCount}` : '進捗の材料がまだありません',
      }),
      el('span', { text: p?.idleDays === null || p?.idleDays === undefined ? '動きなし' : `${p.idleDays}日前に動き` }),
      linkedOpen.length ? el('span', { text: `未完了 ${linkedOpen.length}件` }) : null,
    ),

    p?.nextMilestone
      ? el(
          'p',
          { style: { marginTop: '10px', fontWeight: '600' } },
          '次の一歩: ',
          el('span', { style: { fontWeight: '400' }, text: p.nextMilestone }),
        )
      : null,

    goal.milestones.length ? milestones : null,
    addMilestone,

    el(
      'div',
      { class: 'row', style: { marginTop: '12px' } },
      goal.status === 'active'
        ? el('button', {
            type: 'button',
            class: 'btn btn--sm',
            text: '達成にする',
            onClick: () => ctx.act(() => api.updateGoal(goal.id, { status: 'achieved' }), 'おめでとうございます'),
          })
        : el('button', {
            type: 'button',
            class: 'btn btn--sm',
            text: '進行中に戻す',
            onClick: () => ctx.act(() => api.updateGoal(goal.id, { status: 'active' })),
          }),
      el('button', {
        type: 'button',
        class: 'btn btn--sm btn--ghost btn--danger',
        text: '削除',
        onClick: () => {
          if (!confirm(`「${goal.title}」を削除しますか？ 紐づくやくそくは残ります。`)) return;
          ctx.act(() => api.deleteGoal(goal.id), '削除しました');
        },
      }),
    ),
  );
}

function newGoalCard(ctx) {
  const draft = { title: '', why: '', targetDate: '', milestones: '' };
  return el(
    'section',
    { class: 'card' },
    el('div', { class: 'card__head' }, el('h3', { text: '長期目標を足す' })),
    field(
      '目標',
      el('input', {
        type: 'text',
        placeholder: '例）週3日の仕事に慣れる',
        onInput: (e) => {
          draft.title = e.target.value;
        },
      }),
    ),
    field(
      'なぜ大事か',
      el('textarea', {
        rows: 2,
        placeholder: '本人の言葉のまま書いておくと、迷ったときの判断材料になる',
        onInput: (e) => {
          draft.why = e.target.value;
        },
      }),
    ),
    field(
      'いつまで',
      el('input', {
        type: 'date',
        onChange: (e) => {
          draft.targetDate = e.target.value;
        },
      }),
    ),
    field(
      '一歩に分ける',
      el('textarea', {
        rows: 3,
        placeholder: '1行に1つ。例）\n見学に申し込む\n体験を1日やる',
        onInput: (e) => {
          draft.milestones = e.target.value;
        },
      }),
      '大きいままだと手がつかない',
    ),
    el(
      'div',
      { class: 'row row--end' },
      el('button', {
        type: 'button',
        class: 'btn btn--primary',
        text: '登録する',
        onClick: () => {
          if (!draft.title.trim()) {
            ctx.toast('目標を入れてください', 'error');
            return;
          }
          ctx.act(
            () =>
              api.createGoal({
                title: draft.title,
                why: draft.why,
                targetDate: draft.targetDate || null,
                milestones: draft.milestones
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((title) => ({ title })),
              }),
            '登録しました',
          );
        },
      }),
    ),
  );
}
