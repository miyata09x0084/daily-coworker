/**
 * 「今日」画面。
 *
 * この画面の役目はひとつだけ ——「いま何をすればいいか」を、迷わせずに出すこと。
 * そのため先頭に置くのは件数ではなく、今日かける声の数と、その具体的な言い方にした。
 */

import { el } from '../dom.js';
import { api } from '../api.js';
import { alertRow, copyText, emptyState } from '../components.js';
import { formatJa } from '/shared/dates.js';
import { CHANNELS, UNDERSTANDING_LEVELS, labelOf } from '/shared/constants.js';

export function renderDashboard(ctx) {
  const { insights, settings } = ctx;
  const { summary, alerts, talkingPoints, weekly } = insights;

  return el(
    'div',
    {},
    heroCard(ctx, talkingPoints, summary, settings),
    alertsCard(ctx, alerts),
    talkingCard(ctx, talkingPoints, settings),
    weeklyCard(weekly, settings),
    recentCard(ctx),
  );
}

function heroCard(ctx, talkingPoints, summary, settings) {
  const n = talkingPoints.length;
  return el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'hero' },
      el(
        'div',
        {},
        el('div', { class: 'hero__figure', text: String(n) }),
        el('div', {
          class: 'hero__label',
          text: n === 0 ? `${settings.partnerName}にお願いしていることはありません` : `今日 ${settings.partnerName} に声をかけること`,
        }),
      ),
      el(
        'div',
        { class: 'row', style: { marginLeft: 'auto' } },
        el('button', {
          class: 'btn btn--primary',
          type: 'button',
          text: '＋ 記録する',
          onClick: () => ctx.navigate('capture'),
        }),
        el('button', {
          class: 'btn',
          type: 'button',
          text: '渡すカード',
          onClick: () => ctx.navigate('handoff'),
        }),
      ),
    ),
    el(
      'div',
      { class: 'stats', style: { marginTop: '14px' } },
      stat('期限切れ', summary.overdue, '件', summary.overdue > 0),
      stat('今日が期限', summary.dueToday, '件'),
      stat('お願いしていること', summary.openPartner, '件', summary.openPartner > settings.maxOpenAtOnce),
      stat(`${settings.myName}がやること`, summary.openMe, '件'),
      stat(
        '最後の記録',
        summary.daysSinceContact === null ? '—' : summary.daysSinceContact === 0 ? '今日' : `${summary.daysSinceContact}日前`,
        '',
        summary.daysSinceContact !== null && summary.daysSinceContact >= settings.contactGapDays,
      ),
      stat('連続記録', summary.recordStreak, '日'),
    ),
  );
}

function stat(label, value, unit = '', alarm = false) {
  return el(
    'div',
    { class: `stat${alarm ? ' stat--alarm' : ''}` },
    el('div', { class: 'stat__label', text: label }),
    el(
      'div',
      { class: 'stat__value' },
      String(value),
      unit ? el('small', { text: unit }) : null,
    ),
  );
}

function alertsCard(ctx, alerts) {
  return el(
    'section',
    { class: 'card' },
    el('div', { class: 'card__head' }, el('h2', { text: '抜け漏れチェック' })),
    ...alerts.map((a) =>
      alertRow(a, (alert) => {
        if (alert.code === 'goal_stalled') ctx.navigate('goals');
        else if (alert.code === 'no_records' || alert.code === 'contact_gap') ctx.navigate('capture');
        else ctx.navigate('commitments', { commitmentFilter: filterFor(alert.code), highlightIds: alert.ids });
      }),
    ),
  );
}

function filterFor(code) {
  if (code === 'overdue') return 'overdue';
  if (code === 'due_today') return 'today';
  if (code === 'no_due') return 'nodue';
  return 'open';
}

function talkingCard(ctx, points, settings) {
  const card = el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'card__head' },
      el('h2', { text: '次に話すこと' }),
      el('span', {
        class: 'card__hint',
        text: `一度に渡すのは${settings.maxOpenAtOnce}件まで`,
      }),
    ),
  );

  if (points.length === 0) {
    card.append(emptyState('いま伝えることはありません。'));
    return card;
  }

  points.forEach((p, i) => {
    card.append(
      el(
        'article',
        { class: 'item', style: { marginTop: i === 0 ? '0' : '8px' } },
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between' } },
          el('div', { class: 'item__title', text: `${i + 1}. ${p.title}` }),
          el('span', { class: 'badge', text: p.reason }),
        ),
        el('p', {
          style: { margin: '6px 0 0', fontSize: '0.95rem', color: 'var(--ink-2)' },
          text: p.phrase,
        }),
        p.nextStep
          ? el('p', {
              style: { margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--ink-muted)' },
              text: `まず: ${p.nextStep}`,
            })
          : null,
        el(
          'div',
          { class: 'row', style: { marginTop: '8px' } },
          el('button', {
            class: 'btn btn--sm btn--primary',
            type: 'button',
            text: 'できた',
            onClick: () => ctx.act(() => api.updateCommitment(p.commitmentId, { status: 'done' }), 'できた！を記録しました'),
          }),
          el('button', {
            class: 'btn btn--sm',
            type: 'button',
            text: '伝えた',
            onClick: () => ctx.act(() => api.updateCommitment(p.commitmentId, { addReminder: true }), '伝え直しを記録しました'),
          }),
          el('button', {
            class: 'btn btn--sm btn--ghost',
            type: 'button',
            text: '言い方をコピー',
            onClick: () => copyText(ctx, p.phrase),
          }),
        ),
      ),
    );
  });

  return card;
}

function weeklyCard(weekly, settings) {
  const { thisWeek, lastWeek } = weekly;
  const delta = (a, b) => {
    if (a === b) return '±0';
    return a > b ? `+${a - b}` : String(a - b);
  };
  return el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'card__head' },
      el('h2', { text: '今週' }),
      el('span', { class: 'card__hint', text: `${formatJa(thisWeek.from)} 〜 ${formatJa(thisWeek.to)}` }),
    ),
    el(
      'div',
      { class: 'stats' },
      stat('記録した日', thisWeek.recordedDays, `日 (先週${delta(thisWeek.recordedDays, lastWeek.recordedDays)})`),
      stat('完了', thisWeek.done, `件 (先週${delta(thisWeek.done, lastWeek.done)})`),
      stat('新しいやくそく', thisWeek.created, '件'),
      stat(
        'その日の様子',
        thisWeek.avgCondition === null ? '—' : thisWeek.avgCondition.toFixed(1),
        thisWeek.avgCondition === null ? '' : '／5',
      ),
    ),
  );
}

function recentCard(ctx) {
  const recent = [...ctx.db.interactions]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 5);

  const card = el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'card__head' },
      el('h2', { text: '最近のやりとり' }),
      el('button', {
        class: 'btn btn--sm btn--ghost',
        type: 'button',
        text: 'すべて見る →',
        onClick: () => ctx.navigate('insights'),
      }),
    ),
  );

  if (recent.length === 0) {
    card.append(emptyState('まだ記録がありません。「記録する」から1件入れてみてください。'));
    return card;
  }

  for (const i of recent) {
    card.append(
      el(
        'article',
        { class: 'item' },
        el(
          'div',
          { class: 'row', style: { justifyContent: 'space-between', alignItems: 'flex-start' } },
          el('div', { class: 'item__title', text: i.summary }),
          el('span', { class: 'badge', text: formatJa(i.day, { weekday: false }) }),
        ),
        el(
          'div',
          { class: 'item__meta' },
          el('span', { text: labelOf(CHANNELS, i.channel) }),
          i.condition ? el('span', { text: `様子 ${i.condition}/5` }) : null,
          el('span', { text: labelOf(UNDERSTANDING_LEVELS, i.understanding) }),
        ),
      ),
    );
  }
  return card;
}
