/**
 * 「渡すカード」と「ふりかえり」の文面生成。
 *
 * ここだけは読む相手が違う。グラフや一覧は記録者が読むもので、カードは本人が読むもの。
 * 言葉の理解は保たれているので、図やダッシュボードより「短い文の箇条書き」が確実に届く。
 *
 * カードが守ること:
 *   - 1行1動作
 *   - 日付は必ず具体的に書く
 *   - 一度に渡すのは maxOpenAtOnce 件まで
 *   - できたことを先に置く
 *   - できていないことには触れない（過ぎた日付も書かない）
 *
 * 最後の1つがいちばん大事。渡した紙に責めが1行でも混ざると、
 * その紙自体が「見せられると嫌なもの」になり、次から受け取ってもらえなくなる。
 * 進捗の管理より、受け取り続けてもらえることを優先する。
 * LINE にそのまま貼れるプレーンテキストにしてある。
 */

import { addDays, diffDays, formatJa } from '../shared/dates.js';

const MAX_STEPS_SHOWN = 4;
const MAX_PRAISE = 3;

/**
 * 本人に渡すカード。
 * @param {object} db
 * @param {object} insights buildInsights() の結果
 * @param {{nextTalkDate?: string|null, includeMine?: boolean}} options
 */
export function buildHandoffCard(db, insights, options = {}) {
  const { settings, today, derived } = insights;
  const nextTalkDate = options.nextTalkDate ?? null;
  const includeMine = options.includeMine !== false;
  const limit = settings.maxOpenAtOnce;

  const open = db.commitments.filter((c) => c.status === 'open');
  const forPartner = open
    .filter((c) => c.owner === 'partner' || c.owner === 'both')
    .sort((a, b) => derived[b.id].urgency - derived[a.id].urgency);
  const shown = forPartner.slice(0, limit);
  const deferred = forPartner.slice(limit);
  const forMe = open
    .filter((c) => c.owner === 'me')
    .sort((a, b) => derived[b.id].urgency - derived[a.id].urgency)
    .slice(0, limit);

  const praise = recentWins(db, today);

  const lines = [];
  lines.push(`${formatJa(today)}  ${settings.partnerName}へ`);
  lines.push('');

  if (praise.length) {
    lines.push('【できたこと】');
    for (const win of praise) {
      lines.push(`・${win.title}（${formatJa(win.day, { weekday: false })}）`);
    }
    lines.push('');
  }

  if (shown.length) {
    lines.push('【おねがい】');
    shown.forEach((c, index) => {
      lines.push(`${index + 1}. ${c.title}`);
      lines.push(`   いつまで: ${dueLine(c, derived[c.id])}`);
      const steps = c.steps.filter((s) => !s.done).slice(0, MAX_STEPS_SHOWN);
      for (const step of steps) lines.push(`   - ${step.text}`);
      if (index < shown.length - 1) lines.push('');
    });
    lines.push('');
  } else {
    lines.push('【おねがい】');
    lines.push('・いまは ありません');
    lines.push('');
  }

  if (includeMine && forMe.length) {
    lines.push(`【${settings.myName}がやること】`);
    for (const c of forMe) {
      lines.push(`・${c.title}${c.due ? `（${formatJa(c.due, { weekday: false })}まで）` : ''}`);
    }
    lines.push('');
  }

  if (nextTalkDate) {
    lines.push(`つぎに話すのは ${formatJa(nextTalkDate)}`);
  }
  lines.push('わからなくなったら、この紙を見せて聞いてください。');

  return {
    text: lines.join('\n'),
    shownCount: shown.length,
    deferred: deferred.map((c) => ({ id: c.id, title: c.title })),
    praiseCount: praise.length,
    /** 渡す件数が上限を超えていたら、あえて載せなかったことを記録者に伝える */
    note:
      deferred.length > 0
        ? `${deferred.length}件はカードに載せていません。一度に渡すのは${limit}件までにしています。`
        : '',
  };
}

/**
 * 期限の書き方。
 *
 * 過ぎた日付は、カードに一切出さない。
 * 「9月18日をすぎています」と書かれた紙は、渡した瞬間に責めている紙になる。
 * 記録者の画面には「○日たっています」と出るので、情報は失われない。
 * 本人が受け取る側には、次に決めることだけを残す。
 */
function dueLine(c, derived) {
  if (!c.due || derived.dueState === 'overdue') return '（いっしょに日にちを決める）';
  return `${formatJa(c.due)}まで`;
}

/** 直近7日で完了したやくそく。ほめる材料を毎回さがさなくていいようにする */
function recentWins(db, today) {
  const from = addDays(today, -6);
  return db.commitments
    .filter((c) => c.status === 'done' && c.doneAt)
    .map((c) => ({ title: c.title, day: c.doneAt.slice(0, 10), owner: c.owner }))
    .filter((w) => w.owner !== 'me')
    .filter((w) => diffDays(w.day, from) >= 0 && diffDays(today, w.day) >= 0)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, MAX_PRAISE);
}

/**
 * 記録者向けの週次ふりかえり（Markdown）。
 * 画面でも読めるし、Claude Code のスキルからそのまま読み込める形にしてある。
 */
export function buildWeeklyReview(db, insights) {
  const { settings, weekly, summary, goalProgress, techniqueEffect, alerts, talkingPoints } = insights;
  const { thisWeek, lastWeek } = weekly;
  const out = [];

  out.push(`# ふりかえり ${formatJa(thisWeek.from)} 〜 ${formatJa(thisWeek.to)}`);
  out.push('');
  out.push('## 今週の数字');
  out.push('');
  out.push('| | 今週 | 先週 |');
  out.push('|---|---|---|');
  out.push(`| 記録した日 | ${thisWeek.recordedDays}日 | ${lastWeek.recordedDays}日 |`);
  out.push(`| やりとり | ${thisWeek.interactions}件 | ${lastWeek.interactions}件 |`);
  out.push(`| 新しいやくそく | ${thisWeek.created}件 | ${lastWeek.created}件 |`);
  out.push(`| 完了 | ${thisWeek.done}件 | ${lastWeek.done}件 |`);
  out.push(
    `| その日の様子（平均） | ${fmtNum(thisWeek.avgCondition)} | ${fmtNum(lastWeek.avgCondition)} |`,
  );
  out.push('');

  out.push('## できたこと');
  out.push('');
  if (thisWeek.doneTitles.length) {
    for (const d of thisWeek.doneTitles) out.push(`- ${d.title}（${d.owner}）`);
  } else {
    out.push('- 完了した やくそくはありません');
  }
  out.push('');

  out.push('## 気になっていること');
  out.push('');
  const risky = alerts.filter((a) => a.level !== 'good');
  if (risky.length) {
    for (const a of risky) out.push(`- **${a.title}** — ${a.detail}`);
  } else {
    out.push('- 抜け漏れは見つかりませんでした');
  }
  out.push('');

  out.push('## 次に話すこと');
  out.push('');
  if (talkingPoints.length) {
    for (const p of talkingPoints) {
      out.push(`- ${p.title}（${p.reason}）`);
      out.push(`  - 言い方: ${p.phrase}`);
    }
  } else {
    out.push(`- ${settings.partnerName}にお願いしている ことはありません`);
  }
  out.push('');

  out.push('## 長期目標');
  out.push('');
  const active = goalProgress.filter((g) => g.status === 'active');
  if (active.length) {
    for (const g of active) {
      const pct = Math.round(g.ratio * 100);
      const idle = g.idleDays === null ? '動きなし' : `${g.idleDays}日前に動き`;
      out.push(`- **${g.title}** — ${pct}%${g.stalled ? ' ⚠ 停滞' : ''}（${idle}）`);
      if (g.nextMilestone) out.push(`  - つぎの一歩: ${g.nextMilestone}`);
    }
  } else {
    out.push('- 進行中の目標が登録されていません');
  }
  out.push('');

  out.push('## 伝え方の効き目');
  out.push('');
  const effective = techniqueEffect.rows.filter((r) => r.enough);
  if (effective.length) {
    out.push(`決着したやくそく ${techniqueEffect.sampleSize}件から:`);
    out.push('');
    for (const r of effective.slice(0, 5)) {
      const sign = r.delta >= 0 ? '+' : '';
      out.push(
        `- ${r.label}: あり ${pct(r.withRate)} / なし ${pct(r.withoutRate)}（差 ${sign}${Math.round(r.delta * 100)}pt）`,
      );
    }
  } else {
    out.push(
      `まだ判断できません（決着したやくそく ${techniqueEffect.sampleSize}件。比較には両側 ${techniqueEffect.minSamplePerSide}件ずつ必要）。`,
    );
  }
  out.push('');
  out.push(
    `_未完了 ${summary.openTotal}件 / うち日付が過ぎたもの ${summary.overdue}件・日付未定 ${summary.noDue}件。いま渡しているのは ${summary.openPartner}件（目安 ${settings.maxOpenAtOnce}件）_`,
  );

  return out.join('\n');
}

function fmtNum(v) {
  return v === null || v === undefined ? '—' : v.toFixed(1);
}

function pct(v) {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}
