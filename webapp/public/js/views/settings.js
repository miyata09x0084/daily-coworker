/**
 * 「設定」画面。
 *
 * しきい値を全部いじれるようにしてある。何日で「放置」と見なすか、
 * 同時にいくつまで頼むか、は家庭ごとに違う。既定値は WAIS プロフィール由来の目安でしかない。
 * バックアップ（書き出し・読み込み）もここに置く。ローカル保存なので、消えるときは静かに消える。
 */

import { api } from '../api.js';
import { el, field } from '../dom.js';
import { conceptCard, rulesCard } from '../components.js';
import { DEFAULT_SETTINGS } from '/shared/constants.js';

const NUMERIC_FIELDS = [
  {
    key: 'maxOpenAtOnce',
    label: '一度に渡す上限',
    unit: '件',
    hint: 'これを超えると警告。抱えきれる量は人によって違う',
  },
  { key: 'staleDays', label: '「止まっている」とみなす日数', unit: '日', hint: '動きがない日数' },
  { key: 'contactGapDays', label: '「連絡が途切れた」とみなす日数', unit: '日' },
  { key: 'goalStallDays', label: '目標が「停滞」とみなされる日数', unit: '日' },
  { key: 'noDueNudgeDays', label: '期限なしを催促するまでの日数', unit: '日' },
];

export function renderSettings(ctx) {
  const draft = { ...ctx.settings };

  return el(
    'div',
    {},
    el(
      'section',
      { class: 'card' },
      el('div', { class: 'card__head' }, el('h2', { text: '呼び名' })),
      field(
        '相手の呼び名',
        el('input', {
          type: 'text',
          value: draft.partnerName,
          onInput: (e) => {
            draft.partnerName = e.target.value;
          },
        }),
        '画面とカードに出ます',
      ),
      field(
        '自分の呼び名',
        el('input', {
          type: 'text',
          value: draft.myName,
          onInput: (e) => {
            draft.myName = e.target.value;
          },
        }),
      ),
      el('div', { class: 'card__head', style: { marginTop: '18px' } }, el('h2', { text: 'しきい値' })),
      ...NUMERIC_FIELDS.map((f) =>
        field(
          `${f.label}（既定 ${DEFAULT_SETTINGS[f.key]}${f.unit}）`,
          el('input', {
            type: 'number',
            min: 1,
            max: 365,
            value: draft[f.key],
            onInput: (e) => {
              draft[f.key] = Number(e.target.value);
            },
          }),
          f.hint,
        ),
      ),
      el(
        'div',
        { class: 'row row--end' },
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: '保存する',
          onClick: () => ctx.act(() => api.updateSettings(draft), '保存しました'),
        }),
      ),
    ),

    el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head' },
        el('h2', { text: 'バックアップ' }),
        el('span', { class: 'card__hint', text: 'データはこのパソコンの中だけにあります' }),
      ),
      el(
        'p',
        { style: { color: 'var(--ink-2)', fontSize: '0.9rem' } },
        '記録はサーバーにも外部サービスにも送られません。パソコンを買い替えるときや、消してしまうのが怖いときは書き出してください。',
      ),
      el(
        'div',
        { class: 'row' },
        el('a', { class: 'btn', href: '/api/export', download: '', text: 'JSONで書き出す' }),
        importButton(ctx),
      ),
    ),

    conceptCard(),

    el(
      'section',
      { class: 'card' },
      el('div', { class: 'card__head' }, el('h3', { text: '伝え方の約束' })),
      rulesCard(ctx, { open: true }),
    ),

    el(
      'section',
      { class: 'card' },
      el('div', { class: 'card__head' }, el('h3', { text: 'いまの中身' })),
      el(
        'div',
        { class: 'stats' },
        countStat('やりとり', ctx.db.interactions.length),
        countStat('やくそく', ctx.db.commitments.length),
        countStat('目標', ctx.db.goals.length),
      ),
    ),
  );
}

function countStat(label, value) {
  return el(
    'div',
    { class: 'stat' },
    el('div', { class: 'stat__label', text: label }),
    el('div', { class: 'stat__value', text: String(value) }),
  );
}

function importButton(ctx) {
  const input = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'sr-only',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!confirm('いまの記録をすべて置き換えます。よろしいですか？')) {
        e.target.value = '';
        return;
      }
      try {
        const payload = JSON.parse(await file.text());
        await ctx.act(() => api.importDb(payload), '読み込みました');
      } catch (err) {
        ctx.toast(`読み込めませんでした: ${err.message}`, 'error');
      } finally {
        e.target.value = '';
      }
    },
  });
  return el(
    'span',
    {},
    input,
    el('button', {
      type: 'button',
      class: 'btn',
      text: 'JSONから読み込む',
      onClick: () => input.click(),
    }),
  );
}
