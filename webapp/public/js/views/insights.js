/**
 * 「見える化」画面。読む相手は記録者（弟）だけ。
 * 相手に見せるものはここではなく「渡すカード」に置いている（図は伝わりにくいため）。
 *
 * どのグラフにも表フォールバックを付けてある。色だけに意味を持たせない、
 * という約束を守るためと、数字をそのまま転記したい場面があるため。
 */

import { el } from '../dom.js';
import { agingBars, calendarHeatmap, conditionLine, figure, pct, tableView, techniqueBars } from '../charts.js';
import { emptyState, copyText } from '../components.js';
import { api } from '../api.js';
import { formatJa } from '/shared/dates.js';
import { CHANNELS, FRICTIONS, UNDERSTANDING_LEVELS, labelOf } from '/shared/constants.js';

export function renderInsights(ctx) {
  const { insights } = ctx;

  return el(
    'div',
    {},
    heatmapCard(ctx, insights),
    conditionCard(ctx, insights),
    agingCard(ctx, insights),
    techniqueCard(ctx, insights),
    reviewCard(ctx),
    historyCard(ctx),
  );
}

function heatmapCard(ctx, insights) {
  const cells = insights.heatmap.cells.filter((c) => !c.future);
  const recorded = cells.filter((c) => c.count > 0);
  return figure({
    title: '記録した日',
    hint: `直近12週で ${recorded.length}日／${cells.length}日`,
    chart: calendarHeatmap(insights.heatmap, {
      onSelectDay: (day) => {
        ctx.state.ui.historyDay = day;
        ctx.render();
        document.getElementById('history-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }),
    table: tableView(
      '表で見る（記録があった日）',
      [{ label: '日付' }, { label: '件数', num: true }, { label: '様子', num: true }],
      recorded
        .slice(-40)
        .reverse()
        .map((c) => [formatJa(c.day), String(c.count), c.condition ? c.condition.toFixed(1) : '—']),
    ),
  });
}

function conditionCard(ctx, insights) {
  const points = insights.conditionSeries;
  const recorded = points.filter((p) => p.value !== null);
  if (recorded.length === 0) {
    return figure({
      title: 'その日の様子',
      hint: '直近60日',
      chart: emptyState('様子の記録がまだありません。記録するときに1〜5を選ぶと出ます。'),
    });
  }
  return figure({
    title: 'その日の様子',
    hint: '線は7日平均、点は記録があった日（1=疲れていそう 〜 5=元気そう）',
    chart: conditionLine(points),
    table: tableView(
      '表で見る',
      [{ label: '日付' }, { label: 'その日', num: true }, { label: '7日平均', num: true }],
      recorded
        .slice(-40)
        .reverse()
        .map((p) => [formatJa(p.day), p.value.toFixed(1), p.avg7 === null ? '—' : p.avg7.toFixed(1)]),
    ),
  });
}

function agingCard(ctx, insights) {
  const buckets = insights.agingBuckets;
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) {
    return figure({ title: '未完了のやくそくの古さ', chart: emptyState('未完了のやくそくはありません。') });
  }
  return figure({
    title: '未完了のやくそくの古さ',
    hint: '古いものほど落ちる。上から片付ける',
    chart: agingBars(buckets, {
      onSelect: (b) => ctx.navigate('commitments', { commitmentFilter: 'open', highlightIds: b.ids }),
    }),
    table: tableView(
      '表で見る',
      [{ label: '経過' }, { label: '件数', num: true }],
      buckets.map((b) => [b.label, String(b.count)]),
    ),
  });
}

function techniqueCard(ctx, insights) {
  const te = insights.techniqueEffect;
  const usable = te.rows.filter((r) => r.enough);

  const table = tableView(
    'すべての伝え方を表で見る',
    [
      { label: '伝え方' },
      { label: 'あり', num: true },
      { label: '件数', num: true },
      { label: 'なし', num: true },
      { label: '件数', num: true },
    ],
    te.rows.map((r) => [r.label, pct(r.withRate), String(r.withN), pct(r.withoutRate), String(r.withoutN)]),
  );

  if (usable.length === 0) {
    return figure({
      title: '伝え方の効き目',
      hint: `決着したやくそく ${te.sampleSize}件`,
      chart: emptyState(
        `まだ判断できません。比べるには、同じ工夫を「した」「しなかった」がそれぞれ${te.minSamplePerSide}件ずつ必要です。記録を続けると出ます。`,
      ),
      table,
    });
  }

  const best = usable[0];
  return figure({
    title: '伝え方の効き目',
    hint: `決着したやくそく ${te.sampleSize}件／全体の完了率 ${pct(te.overallRate)}`,
    chart: el(
      'div',
      {},
      el('p', {
        style: { color: 'var(--ink-2)', fontSize: '0.9rem' },
        text:
          best.delta > 0
            ? `いまのところ、いちばん効いているのは「${best.label}」です（完了率 ${pct(best.withRate)} 対 ${pct(best.withoutRate)}）。`
            : `いまのところ、工夫による差ははっきりしていません。`,
      }),
      techniqueBars(usable),
    ),
    table,
  });
}

function reviewCard(ctx) {
  const host = el('div', {});
  const button = el('button', {
    type: 'button',
    class: 'btn',
    text: 'ふりかえりを作る',
    onClick: async () => {
      button.disabled = true;
      try {
        const { markdown } = await api.review();
        host.replaceChildren(
          el('pre', {
            style: {
              whiteSpace: 'pre-wrap',
              background: 'var(--surface-sunken)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              overflowX: 'auto',
            },
            text: markdown,
          }),
          el(
            'div',
            { class: 'row', style: { marginTop: '8px' } },
            el('button', {
              type: 'button',
              class: 'btn btn--sm',
              text: 'コピー',
              onClick: () => copyText(ctx, markdown),
            }),
          ),
        );
      } catch (err) {
        ctx.toast(err.message, 'error');
      } finally {
        button.disabled = false;
      }
    },
  });

  return el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'card__head' },
      el('h3', { text: '週のふりかえり' }),
      el('span', { class: 'card__hint', text: 'そのまま人に共有できる形で出る' }),
    ),
    el('div', { class: 'row' }, button),
    host,
  );
}

function historyCard(ctx) {
  const day = ctx.state.ui.historyDay ?? null;
  const all = [...ctx.db.interactions].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const list = day ? all.filter((i) => i.day === day) : all.slice(0, 20);

  const card = el(
    'section',
    { class: 'card', id: 'history-card' },
    el(
      'div',
      { class: 'card__head' },
      el('h3', { text: day ? `${formatJa(day)} のやりとり` : 'やりとりの履歴' }),
      day
        ? el('button', {
            type: 'button',
            class: 'btn btn--sm btn--ghost',
            text: '全部見る',
            onClick: () => {
              ctx.state.ui.historyDay = null;
              ctx.render();
            },
          })
        : el('span', { class: 'card__hint', text: `新しい順に${Math.min(all.length, 20)}件` }),
    ),
  );

  if (list.length === 0) {
    card.append(emptyState('記録がありません。'));
    return card;
  }

  for (const i of list) {
    const linked = ctx.db.commitments.filter((c) => c.interactionId === i.id);
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
          i.friction !== 'none' ? el('span', { text: labelOf(FRICTIONS, i.friction) }) : null,
          linked.length ? el('span', { text: `やくそく ${linked.length}件` }) : null,
        ),
        i.techniques.length
          ? el('div', { class: 'item__meta' }, el('span', { text: `工夫: ${i.techniques.map((t) => labelOf(ctx.options.techniques, t)).join('、')}` }))
          : null,
        i.note ? el('p', { style: { margin: '6px 0 0', fontSize: '0.88rem', color: 'var(--ink-2)' }, text: i.note }) : null,
        el(
          'div',
          { class: 'row', style: { marginTop: '6px' } },
          el('button', {
            type: 'button',
            class: 'btn btn--sm btn--ghost btn--danger',
            text: '削除',
            onClick: () => {
              if (!confirm('この記録を削除しますか？ 紐づくやくそくは残ります。')) return;
              ctx.act(() => api.deleteInteraction(i.id), '削除しました');
            },
          }),
        ),
      ),
    );
  }
  return card;
}
