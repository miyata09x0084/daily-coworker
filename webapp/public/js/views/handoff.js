/**
 * 「渡すカード」画面。このアプリで唯一、相手が読むもの。
 *
 * 画面のグラフは相手に渡さない。図表より「短い文の箇条書き」のほうが確実に届くうえ、
 * ダッシュボードを見せることは「管理されている」という合図になってしまう。
 * だからここは飾りを持たず、印刷しても送っても同じ形になるプレーンテキストにしてある。
 */

import { api } from '../api.js';
import { el, field } from '../dom.js';
import { copyText } from '../components.js';
import { addDays, formatJa } from '/shared/dates.js';

export function renderHandoff(ctx) {
  const today = ctx.insights.today;
  const state = ctx.state.ui.handoff ?? (ctx.state.ui.handoff = {
    nextTalkDate: addDays(today, 3),
    includeMine: true,
    card: null,
  });

  const preview = el('div', { class: 'handoff', text: state.card?.text ?? '（下の「作る」を押してください）' });
  const noteHost = el('div', {});

  const build = async () => {
    try {
      const card = await api.handoff({
        nextTalkDate: state.nextTalkDate || null,
        includeMine: state.includeMine,
      });
      state.card = card;
      preview.textContent = card.text;
      noteHost.replaceChildren(
        card.note ? el('p', { class: 'card__hint', style: { marginTop: '8px' }, text: card.note } ) : null,
      );
    } catch (err) {
      ctx.toast(err.message, 'error');
    }
  };

  // 開いた時点で最新の内容にしておく。ひと手間あると使われなくなる。
  queueMicrotask(build);

  const dateInput = el('input', {
    type: 'date',
    value: state.nextTalkDate,
    onChange: (e) => {
      state.nextTalkDate = e.target.value;
      build();
    },
  });

  const quick = (label, days) =>
    el('button', {
      type: 'button',
      class: 'chip chip--sm',
      text: label,
      onClick: () => {
        state.nextTalkDate = addDays(today, days);
        dateInput.value = state.nextTalkDate;
        build();
      },
    });

  return el(
    'div',
    {},
    el(
      'section',
      { class: 'card no-print' },
      el(
        'div',
        { class: 'card__head' },
        el('h2', { text: '渡すカード' }),
        el('span', { class: 'card__hint', text: `一度に渡すのは${ctx.settings.maxOpenAtOnce}件まで` }),
      ),
      el(
        'p',
        { style: { color: 'var(--ink-2)', fontSize: '0.9rem' } },
        `${ctx.settings.partnerName}に渡す紙です。口で言うだけだと残りません。印刷するか、そのまま送ってください。`,
      ),
      field(
        'つぎに話す日',
        el('div', { class: 'row' }, dateInput, quick('明日', 1), quick('3日後', 3), quick('1週間後', 7)),
      ),
      el(
        'label',
        { class: 'row', style: { gap: '8px', fontSize: '0.9rem' } },
        el('input', {
          type: 'checkbox',
          checked: state.includeMine,
          onChange: (e) => {
            state.includeMine = e.target.checked;
            build();
          },
        }),
        `${ctx.settings.myName}がやることも載せる`,
      ),
      el(
        'div',
        { class: 'row', style: { marginTop: '12px' } },
        el('button', { type: 'button', class: 'btn btn--primary', text: '作り直す', onClick: build }),
        el('button', {
          type: 'button',
          class: 'btn',
          text: 'コピー',
          onClick: () => copyText(ctx, state.card?.text ?? '', 'カードをコピーしました'),
        }),
        el('button', { type: 'button', class: 'btn', text: '印刷', onClick: () => window.print() }),
      ),
      noteHost,
    ),
    el(
      'section',
      { class: 'card' },
      el('div', { class: 'card__head no-print' }, el('h3', { text: 'プレビュー' }), el('span', { class: 'card__hint', text: formatJa(today) })),
      preview,
    ),
  );
}
