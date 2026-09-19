/**
 * 「やくそく」画面。未完了の open loop を一覧で潰していく場所。
 * 既定の並びは緊急度順（期限切れ → 今日 → 近い → 期限なしで古い）で、
 * 「上から片付ければいい」状態を保つ。
 */

import { api } from '../api.js';
import { chipGroup, el, field } from '../dom.js';
import { commitmentItem, emptyState } from '../components.js';
import { OWNERS } from '/shared/constants.js';
import { addDays } from '/shared/dates.js';

const FILTERS = [
  { key: 'open', label: '未完了' },
  { key: 'overdue', label: '期限切れ' },
  { key: 'today', label: '今日・明日' },
  { key: 'nodue', label: '期限なし' },
  { key: 'partner', label: '兄' },
  { key: 'me', label: 'わたし' },
  { key: 'done', label: '完了' },
];

export function renderCommitments(ctx) {
  const { ui, insights } = ctx.state;
  const derived = insights.derived;

  const matches = (c, filterKey = ui.commitmentFilter) => {
    const d = derived[c.id];
    switch (filterKey) {
      case 'overdue':
        return c.status === 'open' && d.dueState === 'overdue';
      case 'today':
        return c.status === 'open' && (d.dueState === 'today' || d.daysToDue === 1);
      case 'nodue':
        return c.status === 'open' && c.due === null;
      case 'partner':
        return c.status === 'open' && (c.owner === 'partner' || c.owner === 'both');
      case 'me':
        return c.status === 'open' && (c.owner === 'me' || c.owner === 'both');
      case 'done':
        return c.status !== 'open';
      default:
        return c.status === 'open';
    }
  };

  const list = ctx.db.commitments
    .filter(matches)
    .sort((a, b) => {
      if (ui.commitmentFilter === 'done') {
        return (b.doneAt ?? b.updatedAt) < (a.doneAt ?? a.updatedAt) ? -1 : 1;
      }
      return derived[b.id].urgency - derived[a.id].urgency;
    });

  const filterBar = el(
    'div',
    { class: 'chips' },
    ...FILTERS.map((f) => {
      const count = ctx.db.commitments.filter((c) => matches(c, f.key)).length;
      const label = f.key === 'partner' ? ctx.settings.partnerName : f.key === 'me' ? ctx.settings.myName : f.label;
      return el('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(ui.commitmentFilter === f.key),
        text: `${label} ${count}`,
        onClick: () => {
          ui.commitmentFilter = f.key;
          ui.highlightIds = null;
          ctx.render();
        },
      });
    }),
  );

  const listHost = el('div', {});
  if (list.length === 0) {
    listHost.append(emptyState('この条件のやくそくはありません。'));
  } else {
    for (const c of list) {
      const node = commitmentItem(ctx, c, { showSource: true });
      if (ui.highlightIds?.includes(c.id)) {
        node.style.outline = '2px solid var(--series-1)';
        node.style.outlineOffset = '2px';
      }
      listHost.append(node);
    }
  }

  return el(
    'div',
    {},
    el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head' },
        el('h2', { text: 'やくそく' }),
        el('span', {
          class: 'card__hint',
          text: `いまお願いしているのは ${insights.summary.openPartner}件（目安 ${ctx.settings.maxOpenAtOnce}件）`,
        }),
      ),
      filterBar,
      el('div', { style: { marginTop: '12px' } }, listHost),
    ),
    quickAddCard(ctx),
  );
}

/** やりとりの記録なしで直接足したいとき用。思い出したその場で入れられることを優先する */
function quickAddCard(ctx) {
  const draft = { title: '', owner: 'partner', due: '', goalId: '' };
  const dueInput = el('input', {
    type: 'date',
    'aria-label': '期限',
    onChange: (e) => {
      draft.due = e.target.value;
    },
  });
  const titleInput = el('input', {
    type: 'text',
    placeholder: '例）保険証を持っていく',
    onInput: (e) => {
      draft.title = e.target.value;
    },
  });
  const quick = (label, days) =>
    el('button', {
      type: 'button',
      class: 'chip chip--sm',
      text: label,
      onClick: () => {
        draft.due = addDays(ctx.insights.today, days);
        dueInput.value = draft.due;
      },
    });

  return el(
    'section',
    { class: 'card' },
    el('div', { class: 'card__head' }, el('h3', { text: 'やくそくを直接足す' })),
    field('何をする', titleInput),
    field(
      'だれが',
      chipGroup({
        options: OWNERS.map((o) => ({
          ...o,
          label: o.key === 'partner' ? ctx.settings.partnerName : o.key === 'me' ? ctx.settings.myName : o.label,
        })),
        value: draft.owner,
        small: true,
        onChange: (v) => {
          draft.owner = v;
        },
      }),
    ),
    field('いつまで', el('div', { class: 'row' }, dueInput, quick('今日', 0), quick('明日', 1), quick('来週', 7))),
    el(
      'div',
      { class: 'row row--end' },
      el('button', {
        type: 'button',
        class: 'btn btn--primary',
        text: '足す',
        onClick: () => {
          if (!draft.title.trim()) {
            ctx.toast('内容を入れてください', 'error');
            return;
          }
          ctx.act(
            () => api.createCommitment({ title: draft.title, owner: draft.owner, due: draft.due || null }),
            '足しました',
          );
        },
      }),
    ),
  );
}
