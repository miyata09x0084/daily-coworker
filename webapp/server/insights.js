/**
 * 見える化と抜け漏れ検知。
 *
 * 画面もカード生成もここが出す1つの計算結果を読む。表示ごとに計算し直すと
 * 「ダッシュボードでは3件、カードでは2件」のような食い違いが起きるため、
 * 数える場所は1か所に寄せる。
 *
 * 警告は「危ないものを目立たせる」ためにあるので、条件は控えめに絞ってある。
 * 毎日赤く光る画面は、数日で見なくなる。
 */

import {
  DERIVED_TECHNIQUE_READBACK,
  TECHNIQUES,
  labelOf,
  OWNERS,
} from '../shared/constants.js';
import { addDays, dayKey, diffDays, formatJa, relativeJa, startOfWeek, todayKey } from '../shared/dates.js';

const HEATMAP_WEEKS = 12;
const CONDITION_WINDOW_DAYS = 60;
const MIN_SAMPLE_PER_SIDE = 3;

export function buildInsights(db, now = new Date()) {
  const settings = db.settings;
  const tz = settings.tz;
  const today = todayKey(tz, now);

  const derived = {};
  for (const c of db.commitments) {
    derived[c.id] = deriveCommitment(c, today, tz, settings);
  }

  const open = db.commitments.filter((c) => c.status === 'open');
  const openHim = open.filter((c) => c.owner === 'him' || c.owner === 'both');
  const openMe = open.filter((c) => c.owner === 'me' || c.owner === 'both');

  const days = db.interactions.map((i) => i.day).sort();
  const lastContactDay = days.length ? days[days.length - 1] : null;
  const daysSinceContact = lastContactDay ? diffDays(today, lastContactDay) : null;

  const summary = {
    today,
    openTotal: open.length,
    openHim: openHim.length,
    openMe: openMe.length,
    overdue: open.filter((c) => derived[c.id].dueState === 'overdue').length,
    dueToday: open.filter((c) => derived[c.id].dueState === 'today').length,
    dueThisWeek: open.filter((c) => {
      const d = derived[c.id];
      return d.daysToDue !== null && d.daysToDue >= 0 && d.daysToDue <= 7;
    }).length,
    noDue: open.filter((c) => c.due === null).length,
    stale: open.filter((c) => derived[c.id].idleDays >= settings.staleDays).length,
    lastContactDay,
    daysSinceContact,
    recordStreak: recordStreak(db.interactions, today),
    totalInteractions: db.interactions.length,
  };

  return {
    generatedAt: now.toISOString(),
    today,
    settings,
    summary,
    derived,
    alerts: buildAlerts(db, derived, today, settings),
    talkingPoints: buildTalkingPoints(db, derived, today, settings),
    heatmap: buildHeatmap(db, today),
    conditionSeries: buildConditionSeries(db, today),
    agingBuckets: buildAgingBuckets(open, derived),
    techniqueEffect: buildTechniqueEffect(db),
    goalProgress: buildGoalProgress(db, derived, today, settings),
    weekly: buildWeekly(db, today),
  };
}

/* ------------------------------------------------------------------ */

function deriveCommitment(c, today, tz, settings) {
  const createdDay = dayKey(c.createdAt, tz);
  const updatedDay = dayKey(c.updatedAt, tz);
  const daysToDue = c.due ? diffDays(c.due, today) : null;
  let dueState = 'none';
  if (daysToDue !== null) {
    if (daysToDue < 0) dueState = 'overdue';
    else if (daysToDue === 0) dueState = 'today';
    else if (daysToDue <= 3) dueState = 'soon';
    else dueState = 'later';
  }
  const ageDays = diffDays(today, createdDay);
  const idleDays = diffDays(today, updatedDay);
  const stepsTotal = c.steps.length;
  const stepsDone = c.steps.filter((s) => s.done).length;

  return {
    createdDay,
    ageDays,
    idleDays,
    daysToDue,
    dueState,
    dueLabel: c.due ? `${formatJa(c.due)} ${relativeJa(c.due, today)}` : '期限なし',
    stepsTotal,
    stepsDone,
    remindCount: c.reminders.length,
    // 並べ替え用。期限切れ > 今日 > 近い > 期限なしで放置が長い、の順に浮く
    urgency: urgencyScore({ c, daysToDue, dueState, ageDays, idleDays, settings }),
  };
}

function urgencyScore({ c, daysToDue, dueState, ageDays, idleDays, settings }) {
  if (c.status !== 'open') return 0;
  let score = 0;
  if (dueState === 'overdue') score += 1000 + Math.min(-daysToDue, 60) * 10;
  else if (dueState === 'today') score += 900;
  else if (dueState === 'soon') score += 700 - daysToDue * 30;
  else if (dueState === 'later') score += Math.max(0, 300 - daysToDue * 5);
  else score += 200 + Math.min(ageDays, 60) * 5; // 期限なしは放置されるほど危ない

  if (idleDays >= settings.staleDays) score += 120;
  if (c.reminders.length >= 2) score += 80; // 何度も言っている＝伝え方を変える合図
  return score;
}

function recordStreak(interactions, today) {
  const set = new Set(interactions.map((i) => i.day));
  if (set.size === 0) return 0;
  // 今日まだ記録していなくても、昨日まで続いていれば連続は途切れていないと数える
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/* ------------------------------------------------------------------ *
 * 警告
 * ------------------------------------------------------------------ */

function buildAlerts(db, derived, today, settings) {
  const alerts = [];
  const open = db.commitments.filter((c) => c.status === 'open');
  const push = (level, code, title, detail, ids = []) =>
    alerts.push({ level, code, title, detail, ids });

  const overdue = open.filter((c) => derived[c.id].dueState === 'overdue');
  if (overdue.length) {
    const worst = overdue.reduce((a, b) => (derived[a.id].daysToDue < derived[b.id].daysToDue ? a : b));
    push(
      'critical',
      'overdue',
      `日付が過ぎたものが${overdue.length}件`,
      `いちばん古いのは「${worst.title}」で${-derived[worst.id].daysToDue}日。催促ではなく、いつならできるかを一緒に決め直してください。`,
      overdue.map((c) => c.id),
    );
  }

  const dueToday = open.filter((c) => derived[c.id].dueState === 'today');
  if (dueToday.length) {
    push('warning', 'due_today', `今日が期限のやくそくが${dueToday.length}件`, '今日のうちに声をかけましょう。', dueToday.map((c) => c.id));
  }

  // ワーキングメモリへの配慮。数が増えるほど全部こぼれ、しかも本人が追い詰められる。
  // 主語は「渡したこちら」に置く。本人が画面を見ても、責められている文にしない。
  const himOpen = open.filter((c) => c.owner === 'him' || c.owner === 'both');
  if (himOpen.length > settings.maxOpenForHim) {
    push(
      'serious',
      'overload',
      `お願いを${himOpen.length}件ためています`,
      `一度に渡すのは${settings.maxOpenForHim}件までが目安です。${himOpen.length - settings.maxOpenForHim}件はこちらで預かるか、日付を先に延ばしてください。`,
      himOpen.map((c) => c.id),
    );
  }

  const noDueStale = open.filter(
    (c) => c.due === null && derived[c.id].ageDays >= settings.noDueNudgeDays,
  );
  if (noDueStale.length) {
    push(
      'warning',
      'no_due',
      `期限のないやくそくが${noDueStale.length}件`,
      '「そのうち」は実行されません。具体的な日付を決めて、本人に日付で伝えてください。',
      noDueStale.map((c) => c.id),
    );
  }

  // 「言ったつもり」の検出。理解確認をしないまま止まっている約束を名指しする。
  const unconfirmed = open.filter((c) => {
    const src = c.interactionId ? db.interactions.find((i) => i.id === c.interactionId) : null;
    return src && src.understanding !== 'readback' && derived[c.id].idleDays >= settings.staleDays;
  });
  if (unconfirmed.length) {
    push(
      'warning',
      'unconfirmed',
      `伝わったか確かめていないものが${unconfirmed.length}件`,
      '伝えたときに、本人の言葉で戻ってきていません。もう一度、短く伝えて、言い直してもらいましょう。',
      unconfirmed.map((c) => c.id),
    );
  }

  const repeated = open.filter((c) => c.reminders.length >= 3);
  if (repeated.length) {
    push(
      'serious',
      'repeated',
      `同じことを3回以上伝えているものが${repeated.length}件`,
      '回数を重ねても届きません。届いていないのは伝え方のほうです。手順に割る・日付を変える・こちらでやる、のどれかに切り替えてください。',
      repeated.map((c) => c.id),
    );
  }

  const lastContactDay = db.interactions.map((i) => i.day).sort().at(-1) ?? null;
  if (lastContactDay === null) {
    push('warning', 'no_records', 'まだ記録がありません', '今日のやりとりを1件だけ入れてみてください。記憶は当てになりません。');
  } else if (diffDays(today, lastContactDay) >= settings.contactGapDays) {
    push(
      'serious',
      'contact_gap',
      `${diffDays(today, lastContactDay)}日、やりとりの記録がありません`,
      '記録がない期間は、後から何があったか復元できません。短くていいので残してください。',
    );
  }

  const stalledGoals = db.goals.filter((g) => g.status === 'active').filter((g) => {
    const last = lastGoalActivity(db, g.id);
    return last === null || diffDays(today, last) >= settings.goalStallDays;
  });
  if (stalledGoals.length) {
    push(
      'serious',
      'goal_stalled',
      `${settings.goalStallDays}日以上動いていない目標が${stalledGoals.length}件`,
      `「${stalledGoals[0].title}」に向けた今週の一歩を、1つだけ決めてください。`,
      stalledGoals.map((g) => g.id),
    );
  }

  if (alerts.length === 0) {
    push('good', 'clear', '今日の抜け漏れはありません', '期限切れ・放置・伝え忘れは見つかりませんでした。');
  }

  const order = { critical: 0, serious: 1, warning: 2, good: 3 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

/* ------------------------------------------------------------------ *
 * 次に話すこと（最大 maxOpenForHim 件）
 * ------------------------------------------------------------------ */

function buildTalkingPoints(db, derived, today, settings) {
  const candidates = db.commitments
    .filter((c) => c.status === 'open' && (c.owner === 'him' || c.owner === 'both'))
    .sort((a, b) => derived[b.id].urgency - derived[a.id].urgency)
    .slice(0, settings.maxOpenForHim);

  return candidates.map((c) => {
    const d = derived[c.id];
    let reason;
    if (d.dueState === 'overdue') reason = `決めた日から${-d.daysToDue}日たっています`;
    else if (d.dueState === 'today') reason = '今日が期限です';
    else if (d.dueState === 'soon') reason = `期限まであと${d.daysToDue}日です`;
    else if (c.due === null) reason = `期限が決まらないまま${d.ageDays}日たっています`;
    else reason = `期限は${formatJa(c.due)}です`;

    return {
      commitmentId: c.id,
      title: c.title,
      owner: c.owner,
      due: c.due,
      reason,
      remindCount: d.remindCount,
      phrase: suggestPhrase(c, d),
      nextStep: c.steps.find((s) => !s.done)?.text ?? null,
    };
  });
}

/**
 * そのまま言える一文。
 * 抽象語と遠回しをやめ、「何を・いつまで」だけにする。
 *
 * 日付を過ぎたものでは、できていない事実に触れない。
 * 「まだやってないよね」は、言った側にその気がなくても詰問として届き、
 * そこから荒れる。事実の確認を飛ばして、次の日付を決める問いに置き換える。
 * 二択にするのは、自由回答より決めやすいため。
 */
function suggestPhrase(c, d) {
  if (d.dueState === 'overdue') {
    // 「〜の件」は動詞で終わるタイトルに付くと不自然になるので、読点でつなぐ
    return `「${c.title}、いつやるか決めよう。今日と明日なら、どっちがいい？」`;
  }
  if (c.due) {
    return `「${c.title}。${formatJa(c.due, { weekday: true })}までにお願い」`;
  }
  return `「${c.title}。いつやる？ 今カレンダーで日にちを決めよう」`;
}

/* ------------------------------------------------------------------ *
 * グラフ用データ
 * ------------------------------------------------------------------ */

function buildHeatmap(db, today) {
  // 月曜始まりの週で12週ぶん。右端の週が今週になるように揃える。
  const endOfThisWeek = addDays(startOfWeek(today), 6);
  const start = addDays(endOfThisWeek, -(HEATMAP_WEEKS * 7 - 1));
  const byDay = new Map();
  for (const i of db.interactions) {
    if (diffDays(i.day, start) < 0 || diffDays(endOfThisWeek, i.day) < 0) continue;
    const entry = byDay.get(i.day) ?? { count: 0, conditionSum: 0, conditionCount: 0 };
    entry.count += 1;
    if (typeof i.condition === 'number') {
      entry.conditionSum += i.condition;
      entry.conditionCount += 1;
    }
    byDay.set(i.day, entry);
  }

  const cells = [];
  for (let i = 0; i < HEATMAP_WEEKS * 7; i += 1) {
    const day = addDays(start, i);
    const entry = byDay.get(day);
    cells.push({
      day,
      count: entry ? entry.count : 0,
      condition: entry && entry.conditionCount ? entry.conditionSum / entry.conditionCount : null,
      future: diffDays(day, today) > 0,
    });
  }
  return { start, end: endOfThisWeek, weeks: HEATMAP_WEEKS, cells };
}

function buildConditionSeries(db, today) {
  const start = addDays(today, -(CONDITION_WINDOW_DAYS - 1));
  const byDay = new Map();
  for (const i of db.interactions) {
    if (typeof i.condition !== 'number') continue;
    if (diffDays(i.day, start) < 0 || diffDays(today, i.day) < 0) continue;
    const entry = byDay.get(i.day) ?? { sum: 0, n: 0 };
    entry.sum += i.condition;
    entry.n += 1;
    byDay.set(i.day, entry);
  }

  const points = [];
  for (let i = 0; i < CONDITION_WINDOW_DAYS; i += 1) {
    const day = addDays(start, i);
    const entry = byDay.get(day);
    points.push({ day, value: entry ? entry.sum / entry.n : null });
  }

  // 7日移動平均。点がまばらでも傾きが見えるよう、欠測日は平均の母数に入れない。
  for (let i = 0; i < points.length; i += 1) {
    const window = points.slice(Math.max(0, i - 6), i + 1).filter((p) => p.value !== null);
    points[i].avg7 = window.length
      ? window.reduce((sum, p) => sum + p.value, 0) / window.length
      : null;
  }
  return points;
}

function buildAgingBuckets(open, derived) {
  const defs = [
    { key: 'fresh', label: '0〜2日', test: (d) => d.ageDays <= 2 },
    { key: 'week', label: '3〜6日', test: (d) => d.ageDays >= 3 && d.ageDays <= 6 },
    { key: 'two', label: '7〜13日', test: (d) => d.ageDays >= 7 && d.ageDays <= 13 },
    { key: 'old', label: '14日以上', test: (d) => d.ageDays >= 14 },
  ];
  return defs.map((def) => {
    const hits = open.filter((c) => def.test(derived[c.id]));
    return { key: def.key, label: def.label, count: hits.length, ids: hits.map((c) => c.id) };
  });
}

/**
 * 伝え方の効き目。
 * 決着済み（done / dropped）のやくそくだけを母数にして、工夫あり／なしの完了率を比べる。
 * 未決着を「未完了」と数えると、最近の記録ほど不利になって嘘の差が出る。
 */
function buildTechniqueEffect(db) {
  const interactionsById = new Map(db.interactions.map((i) => [i.id, i]));
  const resolved = db.commitments.filter(
    (c) => (c.status === 'done' || c.status === 'dropped') && c.interactionId,
  );
  const withSource = resolved
    .map((c) => ({ c, src: interactionsById.get(c.interactionId) }))
    .filter((pair) => pair.src);

  const defs = [...TECHNIQUES, DERIVED_TECHNIQUE_READBACK];
  const rows = defs.map((def) => {
    const has = (src) =>
      def.key === DERIVED_TECHNIQUE_READBACK.key
        ? src.understanding === 'readback'
        : src.techniques.includes(def.key);

    const withSet = withSource.filter((p) => has(p.src));
    const withoutSet = withSource.filter((p) => !has(p.src));
    const rate = (set) =>
      set.length ? set.filter((p) => p.c.status === 'done').length / set.length : null;

    const withRate = rate(withSet);
    const withoutRate = rate(withoutSet);
    const enough = withSet.length >= MIN_SAMPLE_PER_SIDE && withoutSet.length >= MIN_SAMPLE_PER_SIDE;

    return {
      key: def.key,
      label: def.label,
      hint: def.hint,
      withN: withSet.length,
      withoutN: withoutSet.length,
      withRate,
      withoutRate,
      delta: enough ? withRate - withoutRate : null,
      enough,
    };
  });

  const total = withSource.length;
  const done = withSource.filter((p) => p.c.status === 'done').length;
  return {
    sampleSize: total,
    minSamplePerSide: MIN_SAMPLE_PER_SIDE,
    overallRate: total ? done / total : null,
    rows: rows.sort((a, b) => {
      if (a.enough !== b.enough) return a.enough ? -1 : 1;
      if (a.enough) return b.delta - a.delta;
      return b.withN + b.withoutN - (a.withN + a.withoutN);
    }),
  };
}

function lastGoalActivity(db, goalId) {
  const days = [
    ...db.interactions.filter((i) => i.goalId === goalId).map((i) => i.day),
    ...db.commitments
      .filter((c) => c.goalId === goalId)
      .map((c) => (c.doneAt ? c.doneAt : c.updatedAt))
      .map((iso) => iso.slice(0, 10)),
  ].sort();
  return days.length ? days[days.length - 1] : null;
}

function buildGoalProgress(db, derived, today, settings) {
  return db.goals.map((goal) => {
    const linked = db.commitments.filter((c) => c.goalId === goal.id);
    const openLinked = linked.filter((c) => c.status === 'open');
    const doneLinked = linked.filter((c) => c.status === 'done');
    const milestoneTotal = goal.milestones.length;
    const milestoneDone = goal.milestones.filter((m) => m.done).length;
    const lastActivity = lastGoalActivity(db, goal.id);
    const idleDays = lastActivity === null ? null : diffDays(today, lastActivity);

    // 進捗はマイルストーンがあればそれを、なければ紐づくやくそくの完了率で代用する
    const ratio = milestoneTotal
      ? milestoneDone / milestoneTotal
      : linked.length
        ? doneLinked.length / linked.length
        : 0;

    return {
      goalId: goal.id,
      title: goal.title,
      status: goal.status,
      targetDate: goal.targetDate,
      daysLeft: goal.targetDate ? diffDays(goal.targetDate, today) : null,
      milestoneTotal,
      milestoneDone,
      nextMilestone: goal.milestones.find((m) => !m.done)?.title ?? null,
      openCount: openLinked.length,
      doneCount: doneLinked.length,
      ratio,
      lastActivity,
      idleDays,
      stalled:
        goal.status === 'active' && (idleDays === null || idleDays >= settings.goalStallDays),
      basis: milestoneTotal ? 'milestone' : linked.length ? 'commitment' : 'none',
    };
  });
}

function buildWeekly(db, today) {
  const thisWeekStart = startOfWeek(today);
  const lastWeekStart = addDays(thisWeekStart, -7);

  const countIn = (from, to) => {
    const inRange = (day) => diffDays(day, from) >= 0 && diffDays(to, day) >= 0;
    const interactions = db.interactions.filter((i) => inRange(i.day));
    const created = db.commitments.filter((c) => inRange(c.createdAt.slice(0, 10)));
    const done = db.commitments.filter((c) => c.doneAt && inRange(c.doneAt.slice(0, 10)));
    const conditions = interactions.filter((i) => typeof i.condition === 'number');
    return {
      from,
      to,
      interactions: interactions.length,
      recordedDays: new Set(interactions.map((i) => i.day)).size,
      created: created.length,
      done: done.length,
      avgCondition: conditions.length
        ? conditions.reduce((sum, i) => sum + i.condition, 0) / conditions.length
        : null,
      doneTitles: done.map((c) => ({ id: c.id, title: c.title, owner: labelOf(OWNERS, c.owner) })),
    };
  };

  return {
    thisWeek: countIn(thisWeekStart, addDays(thisWeekStart, 6)),
    lastWeek: countIn(lastWeekStart, addDays(lastWeekStart, 6)),
  };
}
