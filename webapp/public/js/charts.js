/**
 * SVG チャート。外部ライブラリは使わない。
 *
 * 守っている規範:
 *   - 色は役割で決める（連続尺度＝青1色の濃淡、順序尺度＝同色の段、2系列＝固定スロット順）
 *   - 線は2px、棒は24px以下でデータ端だけ角丸、グリッドは1本線で控えめ
 *   - 系列が2つ以上なら凡例を必ず出す
 *   - どのチャートにも表フォールバックを付ける（色だけに意味を持たせない）
 *   - ホバーで値が読める
 */

import { el, svg } from './dom.js';
import { formatJa } from '/shared/dates.js';

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** チャート本体と表フォールバックをまとめた図として返す */
export function figure({ title, hint, chart, table, legend }) {
  return el(
    'section',
    { class: 'card' },
    el(
      'div',
      { class: 'card__head' },
      el('h3', { text: title }),
      hint ? el('span', { class: 'card__hint', text: hint }) : null,
    ),
    legend ?? null,
    chart,
    table ?? null,
  );
}

export function legendOf(keys) {
  return el(
    'div',
    { class: 'legend' },
    ...keys.map((k) =>
      el(
        'span',
        { class: 'legend__key' },
        el('span', { class: 'legend__swatch', style: { background: k.color } }),
        k.label,
      ),
    ),
  );
}

export function tableView(summary, headers, rows) {
  return el(
    'details',
    { class: 'table-view' },
    el('summary', { text: summary }),
    el(
      'table',
      {},
      el('thead', {}, el('tr', {}, ...headers.map((h) => el('th', { class: h.num ? 'num' : null, text: h.label })))),
      el(
        'tbody',
        {},
        ...rows.map((row) =>
          el('tr', {}, ...row.map((cell, i) => el('td', { class: headers[i]?.num ? 'num' : null, text: cell }))),
        ),
      ),
    ),
  );
}

function tooltipHost() {
  const wrap = el('div', { class: 'chart-wrap' });
  const tip = el('div', { class: 'tooltip' });
  wrap.append(tip);
  const show = (event, text) => {
    tip.textContent = text;
    tip.dataset.show = 'true';
    const box = wrap.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    tip.style.left = `${Math.min(Math.max(x + 12, 4), Math.max(box.width - tip.offsetWidth - 4, 4))}px`;
    tip.style.top = `${Math.max(y - tip.offsetHeight - 10, 2)}px`;
  };
  const hide = () => {
    tip.dataset.show = 'false';
  };
  wrap.addEventListener('pointerleave', hide);
  return { wrap, show, hide };
}

/* ------------------------------------------------------------------ *
 * 1. 記録カレンダー（連続尺度：青1色の濃淡）
 * ------------------------------------------------------------------ */

export function calendarHeatmap(heatmap, { onSelectDay } = {}) {
  const CELL = 16;
  const GAP = 2; // 面の色で隙間をつくる（枠線は引かない）
  const SLOT = CELL + GAP;
  const LEFT = 24;
  const TOP = 16;
  const weeks = heatmap.weeks;
  const width = LEFT + weeks * SLOT;
  const height = TOP + 7 * SLOT;

  const steps = [cssVar('--heat-0'), cssVar('--heat-1'), cssVar('--heat-2'), cssVar('--heat-3'), cssVar('--heat-4')];
  const colorOf = (count) => steps[Math.min(count, 4)];

  const { wrap, show, hide } = tooltipHost();
  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': '記録した日のカレンダー',
    style: { maxWidth: `${width * 1.9}px` },
  });

  // 曜日ラベル（月・水・金だけ。全部出すと密度が上がりすぎる）
  ['月', '', '水', '', '金', '', ''].forEach((label, row) => {
    if (!label) return;
    root.append(
      svg('text', {
        x: LEFT - 6,
        y: TOP + row * SLOT + CELL - 4,
        'text-anchor': 'end',
        'font-size': 9,
        fill: cssVar('--ink-muted'),
        text: label,
      }),
    );
  });

  let lastMonth = null;
  let lastMonthWeek = -99;
  heatmap.cells.forEach((cell, index) => {
    const week = Math.floor(index / 7);
    const row = index % 7; // cells は月曜始まりで並んでいる
    const x = LEFT + week * SLOT;
    const y = TOP + row * SLOT;

    if (row === 0) {
      const month = Number(cell.day.slice(5, 7));
      const changed = month !== lastMonth;
      lastMonth = month;
      // 月が変わってもラベルが隣り合うと重なって読めない。
      // 間隔が足りない月はラベルを出さない（ずらして出すと違う週を指してしまうため）。
      if (changed && week - lastMonthWeek >= 2) {
        lastMonthWeek = week;
        root.append(
          svg('text', {
            x,
            y: TOP - 5,
            'font-size': 9,
            fill: cssVar('--ink-muted'),
            text: `${month}月`,
          }),
        );
      }
    }

    const rect = svg('rect', {
      x,
      y,
      width: CELL,
      height: CELL,
      rx: 3,
      fill: cell.future ? 'transparent' : colorOf(cell.count),
      stroke: cell.future ? cssVar('--grid') : 'none',
      'stroke-dasharray': cell.future ? '2 2' : null,
      style: onSelectDay && cell.count ? { cursor: 'pointer' } : null,
    });
    const label = `${formatJa(cell.day)}　${cell.count ? `${cell.count}件` : '記録なし'}${
      cell.condition ? `／調子 ${cell.condition.toFixed(1)}` : ''
    }`;
    rect.addEventListener('pointerenter', (e) => show(e, label));
    rect.addEventListener('pointermove', (e) => show(e, label));
    if (onSelectDay && cell.count) rect.addEventListener('click', () => onSelectDay(cell.day));
    root.append(rect);
  });

  // 凡例（1系列なので色の意味だけを示す小さな目盛り）
  const scale = el(
    'div',
    { class: 'legend', style: { marginTop: '8px' } },
    el('span', { class: 'legend__key', text: '少' }),
    ...steps.map((color) => el('span', { class: 'legend__swatch', style: { background: color } })),
    el('span', { class: 'legend__key', text: '多' }),
  );

  wrap.append(root);
  wrap.addEventListener('pointerleave', hide);
  return el('div', {}, wrap, scale);
}

/* ------------------------------------------------------------------ *
 * 2. 調子の推移（1系列：線＋面のウォッシュ）
 * ------------------------------------------------------------------ */

export function conditionLine(points) {
  const W = 640;
  const H = 180;
  const PAD = { top: 12, right: 40, bottom: 22, left: 26 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = points.length;
  const x = (i) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v) => PAD.top + plotH - ((v - 1) / 4) * plotH;

  const { wrap, show, hide } = tooltipHost();
  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': '調子の推移',
  });

  for (let v = 1; v <= 5; v += 1) {
    root.append(
      svg('line', {
        x1: PAD.left,
        x2: W - PAD.right,
        y1: y(v),
        y2: y(v),
        stroke: v === 1 ? cssVar('--axis') : cssVar('--grid'),
        'stroke-width': 1,
      }),
      svg('text', {
        x: PAD.left - 6,
        y: y(v) + 3,
        'text-anchor': 'end',
        'font-size': 9,
        fill: cssVar('--ink-muted'),
        text: String(v),
      }),
    );
  }

  const avgPts = points.map((p, i) => ({ i, v: p.avg7 })).filter((p) => p.v !== null);
  const color = cssVar('--series-1');

  if (avgPts.length >= 2) {
    const line = avgPts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L');
    root.append(
      svg('path', {
        d: `M${x(avgPts[0].i).toFixed(1)},${y(1)} L${line} L${x(avgPts.at(-1).i).toFixed(1)},${y(1)} Z`,
        fill: color,
        'fill-opacity': 0.1,
      }),
      svg('path', {
        d: `M${line}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      }),
    );
  }

  // 実際に記録があった日だけ点を打つ。線は7日平均なので、点は「事実の密度」を示す
  for (const p of points.map((p, i) => ({ i, v: p.value })).filter((p) => p.v !== null)) {
    root.append(
      svg('circle', {
        cx: x(p.i),
        cy: y(p.v),
        r: 3,
        fill: color,
        stroke: cssVar('--surface'),
        'stroke-width': 2,
      }),
    );
  }

  const last = avgPts.at(-1);
  if (last) {
    root.append(
      svg('circle', {
        cx: x(last.i),
        cy: y(last.v),
        r: 4.5,
        fill: color,
        stroke: cssVar('--surface'),
        'stroke-width': 2,
      }),
      svg('text', {
        x: x(last.i) + 9,
        y: y(last.v) + 4,
        'font-size': 11,
        'font-weight': 600,
        fill: cssVar('--ink'),
        text: last.v.toFixed(1),
      }),
    );
  }

  root.append(
    svg('text', { x: PAD.left, y: H - 6, 'font-size': 9, fill: cssVar('--ink-muted'), text: formatJa(points[0].day, { weekday: false }) }),
    svg('text', {
      x: W - PAD.right,
      y: H - 6,
      'text-anchor': 'end',
      'font-size': 9,
      fill: cssVar('--ink-muted'),
      text: formatJa(points.at(-1).day, { weekday: false }),
    }),
  );

  // ホバー用の当たり判定（点より広く取る）
  const band = plotW / Math.max(n - 1, 1);
  points.forEach((p, i) => {
    const hit = svg('rect', {
      x: x(i) - band / 2,
      y: PAD.top,
      width: band,
      height: plotH,
      fill: 'transparent',
    });
    const text = `${formatJa(p.day)}　${p.value === null ? '記録なし' : `その日 ${p.value.toFixed(1)}`}${
      p.avg7 === null ? '' : `／7日平均 ${p.avg7.toFixed(1)}`
    }`;
    hit.addEventListener('pointerenter', (e) => show(e, text));
    hit.addEventListener('pointermove', (e) => show(e, text));
    root.append(hit);
  });

  wrap.append(root);
  wrap.addEventListener('pointerleave', hide);
  return wrap;
}

/* ------------------------------------------------------------------ *
 * 3. 放置日数（順序尺度：同色の段）
 * ------------------------------------------------------------------ */

export function agingBars(buckets, { onSelect } = {}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const ROW = 34;
  const BAR = 22; // 24px 以下
  const W = 640;
  const LEFT = 76;
  const RIGHT = 44;
  const H = buckets.length * ROW + 8;
  const ramp = [cssVar('--ord-1'), cssVar('--ord-2'), cssVar('--ord-3'), cssVar('--ord-4')];

  const { wrap, show, hide } = tooltipHost();
  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': '未完了のやくそくが何日たっているか',
  });

  buckets.forEach((b, i) => {
    const y = i * ROW + 6;
    const w = (b.count / max) * (W - LEFT - RIGHT);
    root.append(
      svg('text', {
        x: LEFT - 8,
        y: y + BAR / 2 + 4,
        'text-anchor': 'end',
        'font-size': 11,
        fill: cssVar('--ink-2'),
        text: b.label,
      }),
    );
    if (b.count > 0) {
      const bar = svg('path', {
        // 起点は角を立て、データ端だけ 4px 丸める
        d: roundedRightBar(LEFT, y, Math.max(w, 6), BAR, 4),
        fill: ramp[i] ?? ramp.at(-1),
        style: onSelect ? { cursor: 'pointer' } : null,
      });
      const label = `${b.label}：${b.count}件`;
      bar.addEventListener('pointerenter', (e) => show(e, label));
      bar.addEventListener('pointermove', (e) => show(e, label));
      if (onSelect) bar.addEventListener('click', () => onSelect(b));
      root.append(bar);
    }
    root.append(
      svg('text', {
        x: LEFT + Math.max(w, 6) + 8,
        y: y + BAR / 2 + 4,
        'font-size': 11,
        'font-weight': 600,
        fill: b.count ? cssVar('--ink') : cssVar('--ink-muted'),
        text: `${b.count}件`,
      }),
    );
  });

  root.append(
    svg('line', {
      x1: LEFT,
      x2: LEFT,
      y1: 4,
      y2: H - 4,
      stroke: cssVar('--axis'),
      'stroke-width': 1,
    }),
  );

  wrap.append(root);
  wrap.addEventListener('pointerleave', hide);
  return wrap;
}

/* ------------------------------------------------------------------ *
 * 4. 伝え方の効き目（2系列：スロット1と2、凡例必須）
 * ------------------------------------------------------------------ */

export function techniqueBars(rows) {
  const W = 640;
  const LEFT = 190;
  const RIGHT = 52;
  const GROUP = 46;
  const BAR = 16;
  const GAP = 2; // 隣り合う棒は面の色で2px空ける
  const H = rows.length * GROUP + 10;
  const plotW = W - LEFT - RIGHT;
  const withColor = cssVar('--series-1');
  const withoutColor = cssVar('--series-2');

  const { wrap, show, hide } = tooltipHost();
  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': '伝え方ごとの完了率',
  });

  rows.forEach((row, i) => {
    const top = i * GROUP + 6;
    root.append(
      svg('text', {
        x: LEFT - 10,
        y: top + BAR + 2,
        'text-anchor': 'end',
        'font-size': 11,
        fill: cssVar('--ink-2'),
        text: truncate(row.label, 14),
      }),
    );

    [
      { rate: row.withRate, n: row.withN, color: withColor, label: 'あり', y: top },
      { rate: row.withoutRate, n: row.withoutN, color: withoutColor, label: 'なし', y: top + BAR + GAP },
    ].forEach((bar) => {
      const w = Math.max((bar.rate ?? 0) * plotW, 2);
      const mark = svg('path', {
        d: roundedRightBar(LEFT, bar.y, w, BAR, 4),
        fill: bar.color,
      });
      const text = `${row.label}・${bar.label}：完了率 ${pct(bar.rate)}（${bar.n}件）`;
      mark.addEventListener('pointerenter', (e) => show(e, text));
      mark.addEventListener('pointermove', (e) => show(e, text));
      root.append(
        mark,
        svg('text', {
          x: LEFT + w + 7,
          y: bar.y + BAR - 3,
          'font-size': 10,
          fill: cssVar('--ink-2'),
          text: pct(bar.rate),
        }),
      );
    });
  });

  root.append(
    svg('line', { x1: LEFT, x2: LEFT, y1: 2, y2: H - 4, stroke: cssVar('--axis'), 'stroke-width': 1 }),
  );

  wrap.append(root);
  wrap.addEventListener('pointerleave', hide);
  return el(
    'div',
    {},
    legendOf([
      { label: 'その工夫をした', color: withColor },
      { label: 'しなかった', color: withoutColor },
    ]),
    wrap,
  );
}

/* ------------------------------------------------------------------ */

function roundedRightBar(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  return [
    `M${x},${y}`,
    `H${x + w - radius}`,
    `A${radius},${radius} 0 0 1 ${x + w},${y + radius}`,
    `V${y + h - radius}`,
    `A${radius},${radius} 0 0 1 ${x + w - radius},${y + h}`,
    `H${x}`,
    'Z',
  ].join(' ');
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function pct(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}
