/**
 * 「記録する」画面。
 *
 * ここが続くかどうかでシステム全体の値打ちが決まるので、必須項目は本文ひとつだけにしてある。
 * その日の様子や伝え方は入れれば分析が効くが、入れなくても保存できる。
 * 入力を強制すると、忙しい日から順に記録が途切れる。
 *
 * そのうえで「やくそく」は同じ画面で切り出せるようにした。
 * 記録とタスク化を別画面に分けると、そこで必ず抜ける。
 */

import { api } from '../api.js';
import { chipGroup, el, field } from '../dom.js';
import {
  CHANNELS,
  CONDITIONS,
  FRICTIONS,
  OWNERS,
  TECHNIQUES,
  UNDERSTANDING_LEVELS,
  WRITING_EXAMPLES,
} from '/shared/constants.js';
import { addDays } from '/shared/dates.js';

export function renderCapture(ctx) {
  const today = ctx.insights.today;
  const form = {
    occurredAt: localInputValue(new Date()),
    summary: '',
    channel: 'face',
    condition: null,
    understanding: 'none',
    friction: 'none',
    techniques: [],
    goalId: '',
    note: '',
    commitments: [],
  };

  const commitmentsHost = el('div', {});
  const renderCommitmentRows = () => {
    commitmentsHost.replaceChildren();
    if (form.commitments.length === 0) {
      commitmentsHost.append(
        el('p', {
          class: 'empty',
          text: '今日の話で「やる」と決めたことがあれば、ここに切り出しておきます。',
        }),
      );
    }
    form.commitments.forEach((row, index) => {
      commitmentsHost.append(commitmentRow(ctx, form, row, index, renderCommitmentRows, today));
    });
    commitmentsHost.append(
      el(
        'div',
        { class: 'row', style: { marginTop: '8px' } },
        el('button', {
          type: 'button',
          class: 'btn btn--sm',
          text: '＋ やくそくを足す',
          onClick: () => {
            form.commitments.push({ title: '', owner: 'partner', due: '', stepsText: '' });
            renderCommitmentRows();
          },
        }),
      ),
    );
  };
  renderCommitmentRows();

  const summaryInput = el('textarea', {
    id: 'summary',
    required: true,
    placeholder: '例）通院の日程を決めた。紙に書いて渡し、日付を言い直してもらった。',
    onInput: (e) => {
      form.summary = e.target.value;
    },
  });

  const submit = el('button', { type: 'submit', class: 'btn btn--primary', text: '記録する' });

  const formEl = el(
    'form',
    {
      onSubmit: async (event) => {
        event.preventDefault();
        if (!form.summary.trim()) {
          ctx.toast('話した内容を入れてください', 'error');
          summaryInput.focus();
          return;
        }
        submit.disabled = true;
        try {
          await ctx.act(
            () =>
              api.createInteraction({
                occurredAt: new Date(form.occurredAt).toISOString(),
                summary: form.summary,
                channel: form.channel,
                condition: form.condition,
                understanding: form.understanding,
                friction: form.friction,
                techniques: form.techniques,
                goalId: form.goalId || null,
                note: form.note,
                commitments: form.commitments
                  .filter((c) => c.title.trim())
                  .map((c) => ({
                    title: c.title,
                    owner: c.owner,
                    due: c.due || null,
                    steps: c.stepsText
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((text) => ({ text })),
                  })),
              }),
            '記録しました',
          );
          ctx.navigate('today');
        } catch {
          submit.disabled = false;
        }
      },
    },
    el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card__head' },
        el('h2', { text: 'やりとりを記録する' }),
        el('span', { class: 'card__hint', text: '必須は本文だけ' }),
      ),
      field(
        '話した内容',
        summaryInput,
        '短くていい。主語は自分にする',
      ),
      writingHint(),
      field(
        'いつ',
        el('input', {
          type: 'datetime-local',
          value: form.occurredAt,
          onChange: (e) => {
            form.occurredAt = e.target.value;
          },
        }),
      ),
      field(
        'どうやって',
        chipGroup({
          options: CHANNELS,
          value: form.channel,
          onChange: (v) => {
            form.channel = v;
          },
        }),
      ),
      field(
        'その日の様子',
        chipGroup({
          options: CONDITIONS.map((c) => ({ key: c.value, label: `${c.value} ${c.label}` })),
          value: form.condition,
          onChange: (v) => {
            form.condition = form.condition === v ? null : v;
          },
        }),
        '評価ではなく、重い話をしていい日かの目印',
      ),
      field(
        '伝わったかの確認',
        chipGroup({
          options: UNDERSTANDING_LEVELS,
          value: form.understanding,
          onChange: (v) => {
            form.understanding = v;
          },
        }),
        '「わかった？」では足りないので3段階に分けている',
      ),
      field(
        '伝わりぐあい',
        chipGroup({
          options: FRICTIONS,
          value: form.friction,
          onChange: (v) => {
            form.friction = v;
          },
        }),
      ),
      field(
        '使った伝え方',
        chipGroup({
          options: TECHNIQUES,
          value: form.techniques,
          multiple: true,
          small: true,
          onChange: (v) => {
            form.techniques = v;
          },
        }),
        'あとで「どれが効いたか」を出すために使う',
      ),
      ctx.db.goals.length
        ? field(
            '関係する長期目標',
            el(
              'select',
              {
                onChange: (e) => {
                  form.goalId = e.target.value;
                },
              },
              el('option', { value: '', text: '（なし）' }),
              ...ctx.db.goals
                .filter((g) => g.status === 'active')
                .map((g) => el('option', { value: g.id, text: g.title })),
            ),
          )
        : null,
      el(
        'details',
        {},
        el('summary', { class: 'card__hint', text: 'メモを足す' }),
        el('textarea', {
          style: { marginTop: '8px' },
          placeholder: '言葉づかい、表情、場の様子など',
          onInput: (e) => {
            form.note = e.target.value;
          },
        }),
      ),
    ),
    el(
      'section',
      { class: 'card', style: { marginTop: '16px' } },
      el(
        'div',
        { class: 'card__head' },
        el('h2', { text: 'この話で決まったこと' }),
        el('span', { class: 'card__hint', text: '抜け漏れはここで防ぐ' }),
      ),
      commitmentsHost,
    ),
    el(
      'div',
      { class: 'row row--end', style: { marginTop: '16px' } },
      el('button', { type: 'button', class: 'btn btn--ghost', text: 'やめる', onClick: () => ctx.navigate('today') }),
      submit,
    ),
  );

  queueMicrotask(() => summaryInput.focus());
  return formEl;
}

/**
 * 書き方の作法を入力欄のすぐ横に置く。
 * この画面はいつか相手に覗かれる。そのとき傷つく言葉が書いてあると、
 * 記録そのものが続かなくなるので、例を出して主語を自分に寄せてもらう。
 */
function writingHint() {
  return el(
    'details',
    { class: 'table-view', style: { marginTop: '-8px', marginBottom: '14px' } },
    el('summary', { text: '書き方に迷ったら（画面はいつか覗かれます）' }),
    el(
      'table',
      {},
      el(
        'thead',
        {},
        el('tr', {}, el('th', { text: '書かない' }), el('th', { text: 'こう書く' })),
      ),
      el(
        'tbody',
        {},
        ...WRITING_EXAMPLES.map((e) =>
          el(
            'tr',
            {},
            el('td', { style: { color: 'var(--critical-ink)' }, text: e.avoid }),
            el('td', { style: { color: 'var(--good-ink)' }, text: e.instead }),
          ),
        ),
      ),
    ),
    el('p', {
      style: { margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--ink-muted)' },
      text: '主語を自分にすると、記録がそのまま次に直す場所になります。',
    }),
  );
}

function commitmentRow(ctx, form, row, index, rerender, today) {
  const dueInput = el('input', {
    type: 'date',
    value: row.due,
    'aria-label': '期限',
    onChange: (e) => {
      row.due = e.target.value;
    },
  });
  const quick = (label, days) =>
    el('button', {
      type: 'button',
      class: 'chip chip--sm',
      text: label,
      onClick: () => {
        row.due = addDays(today, days);
        dueInput.value = row.due;
      },
    });

  return el(
    'div',
    { class: 'item', style: { marginTop: index === 0 ? '0' : '8px' } },
    el(
      'div',
      { class: 'row', style: { justifyContent: 'space-between' } },
      el('span', { class: 'section-title', text: `やくそく ${index + 1}` }),
      el('button', {
        type: 'button',
        class: 'btn btn--sm btn--ghost btn--danger',
        text: '消す',
        onClick: () => {
          form.commitments.splice(index, 1);
          rerender();
        },
      }),
    ),
    field(
      '何をする',
      el('input', {
        type: 'text',
        value: row.title,
        placeholder: '例）区役所に電話する',
        onInput: (e) => {
          row.title = e.target.value;
        },
      }),
    ),
    field(
      'だれが',
      chipGroup({
        options: OWNERS.map((o) => ({
          ...o,
          label: o.key === 'partner' ? ctx.settings.partnerName : o.key === 'me' ? ctx.settings.myName : o.label,
        })),
        value: row.owner,
        small: true,
        onChange: (v) => {
          row.owner = v;
        },
      }),
    ),
    field(
      'いつまで',
      el('div', { class: 'row' }, dueInput, quick('今日', 0), quick('明日', 1), quick('3日後', 3), quick('来週', 7)),
      '日付で決める。「なるべく早く」は伝わらない',
    ),
    field(
      '手順',
      el('textarea', {
        rows: 3,
        placeholder: '1行に1つ。例）\n9時から17時のあいだに電話する\n「手帳の更新」と言う',
        value: row.stepsText,
        onInput: (e) => {
          row.stepsText = e.target.value;
        },
      }),
      '1行＝1動作まで割ると実行されやすい',
    ),
  );
}

function localInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
