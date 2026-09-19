/**
 * ドメイン操作。入力の検証と、やりとり・やくそく・目標の生成／更新を引き受ける。
 *
 * ここでの中心的な設計判断:
 *   「やりとりを記録したら、その場でやくそくを切り出せる」ことを1操作にまとめている。
 *   記録とタスク化を別操作にすると、記録した直後の「あ、あれ頼んだんだった」が必ず落ちる。
 *   抜け漏れは入力の手間から生まれるので、入口は1つにする。
 */

import { randomUUID } from 'node:crypto';
import {
  CHANNELS,
  COMMITMENT_STATUSES,
  FRICTIONS,
  GOAL_STATUSES,
  LIMITS,
  OWNERS,
  TECHNIQUES,
  UNDERSTANDING_LEVELS,
} from '../shared/constants.js';
import { dayKey, isDayKey } from '../shared/dates.js';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

const keysOf = (list) => list.map((item) => item.key);
const CHANNEL_KEYS = keysOf(CHANNELS);
const TECHNIQUE_KEYS = keysOf(TECHNIQUES);
const UNDERSTANDING_KEYS = keysOf(UNDERSTANDING_LEVELS);
const FRICTION_KEYS = keysOf(FRICTIONS);
const OWNER_KEYS = keysOf(OWNERS);

function str(value, field, { max, required = false, fallback = '' }) {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field}は必須です`);
    return fallback;
  }
  if (typeof value !== 'string') throw new ValidationError(`${field}は文字列で指定してください`);
  const trimmed = value.trim();
  if (required && trimmed === '') throw new ValidationError(`${field}は必須です`);
  if (trimmed.length > max) throw new ValidationError(`${field}は${max}文字以内にしてください`);
  return trimmed;
}

function enumOf(value, allowed, field, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field}が不正です（${allowed.join(' / ')} のいずれか）`);
  }
  return value;
}

function optionalDay(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (!isDayKey(value)) throw new ValidationError(`${field}は YYYY-MM-DD 形式で指定してください`);
  return value;
}

function optionalIso(value, field, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field}が日時として読めません`);
  return d.toISOString();
}

function stringArray(value, allowed, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field}は配列で指定してください`);
  const out = [];
  for (const item of value) {
    if (!allowed.includes(item)) throw new ValidationError(`${field}に不明な値があります: ${item}`);
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function conditionOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new ValidationError('その日の様子は1〜5で指定してください');
  }
  return n;
}

function requireRef(list, id, field) {
  if (id === undefined || id === null || id === '') return null;
  const hit = list.find((item) => item.id === id);
  if (!hit) throw new NotFoundError(`${field}が見つかりません: ${id}`);
  return hit.id;
}

function normalizeSteps(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('手順は配列で指定してください');
  if (value.length > LIMITS.steps) {
    throw new ValidationError(`手順は${LIMITS.steps}個までにしてください（多すぎると本人が追えません）`);
  }
  return value
    .map((raw) => {
      const item = typeof raw === 'string' ? { text: raw } : raw ?? {};
      const text = str(item.text, '手順', { max: LIMITS.stepText, required: true });
      return {
        id: typeof item.id === 'string' && item.id ? item.id : randomUUID(),
        text,
        done: item.done === true,
      };
    })
    .filter((step) => step.text !== '');
}

function normalizeMilestones(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('マイルストーンは配列で指定してください');
  if (value.length > LIMITS.milestones) {
    throw new ValidationError(`マイルストーンは${LIMITS.milestones}個までにしてください`);
  }
  return value
    .map((raw) => {
      const item = typeof raw === 'string' ? { title: raw } : raw ?? {};
      const title = str(item.title, 'マイルストーン', { max: LIMITS.title, required: true });
      return {
        id: typeof item.id === 'string' && item.id ? item.id : randomUUID(),
        title,
        due: optionalDay(item.due, 'マイルストーンの期限'),
        done: item.done === true,
        doneAt: item.done === true ? optionalIso(item.doneAt, 'doneAt', new Date().toISOString()) : null,
      };
    })
    .filter((m) => m.title !== '');
}

/* ------------------------------------------------------------------ *
 * やりとり
 * ------------------------------------------------------------------ */

export function createInteraction(db, input = {}, now = new Date()) {
  const tz = db.settings.tz;
  const nowIso = now.toISOString();
  const occurredAt = optionalIso(input.occurredAt, '日時', nowIso);

  const interaction = {
    id: randomUUID(),
    occurredAt,
    day: dayKey(occurredAt, tz),
    channel: enumOf(input.channel, CHANNEL_KEYS, 'やりとりの手段', 'face'),
    summary: str(input.summary, '話した内容', { max: LIMITS.summary, required: true }),
    condition: conditionOf(input.condition),
    understanding: enumOf(input.understanding, UNDERSTANDING_KEYS, '理解確認', 'none'),
    friction: enumOf(input.friction, FRICTION_KEYS, 'かみ合わなさ', 'none'),
    techniques: stringArray(input.techniques, TECHNIQUE_KEYS, '伝え方の工夫'),
    goalId: requireRef(db.goals, input.goalId, '目標'),
    note: str(input.note, 'メモ', { max: LIMITS.note }),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.interactions.push(interaction);

  // 記録と同時に切り出されたやくそくを作る（入口を1つにするための要）
  const created = [];
  const rawCommitments = Array.isArray(input.commitments) ? input.commitments : [];
  for (const raw of rawCommitments) {
    created.push(
      createCommitment(
        db,
        { ...raw, interactionId: interaction.id, goalId: raw.goalId ?? interaction.goalId },
        now,
      ),
    );
  }

  return { interaction, commitments: created };
}

export function updateInteraction(db, id, patch = {}, now = new Date()) {
  const target = db.interactions.find((item) => item.id === id);
  if (!target) throw new NotFoundError(`やりとりが見つかりません: ${id}`);

  if (patch.occurredAt !== undefined) {
    target.occurredAt = optionalIso(patch.occurredAt, '日時', target.occurredAt);
    target.day = dayKey(target.occurredAt, db.settings.tz);
  }
  if (patch.channel !== undefined) {
    target.channel = enumOf(patch.channel, CHANNEL_KEYS, 'やりとりの手段', target.channel);
  }
  if (patch.summary !== undefined) {
    target.summary = str(patch.summary, '話した内容', { max: LIMITS.summary, required: true });
  }
  if (patch.condition !== undefined) target.condition = conditionOf(patch.condition);
  if (patch.understanding !== undefined) {
    target.understanding = enumOf(patch.understanding, UNDERSTANDING_KEYS, '理解確認', target.understanding);
  }
  if (patch.friction !== undefined) {
    target.friction = enumOf(patch.friction, FRICTION_KEYS, 'かみ合わなさ', target.friction);
  }
  if (patch.techniques !== undefined) {
    target.techniques = stringArray(patch.techniques, TECHNIQUE_KEYS, '伝え方の工夫');
  }
  if (patch.goalId !== undefined) target.goalId = requireRef(db.goals, patch.goalId, '目標');
  if (patch.note !== undefined) target.note = str(patch.note, 'メモ', { max: LIMITS.note });

  target.updatedAt = now.toISOString();
  return target;
}

export function deleteInteraction(db, id) {
  const index = db.interactions.findIndex((item) => item.id === id);
  if (index === -1) throw new NotFoundError(`やりとりが見つかりません: ${id}`);
  const [removed] = db.interactions.splice(index, 1);
  // やくそくは消さない。記録を消しても約束は生きているため、リンクだけ外す。
  for (const c of db.commitments) {
    if (c.interactionId === id) c.interactionId = null;
  }
  return removed;
}

/* ------------------------------------------------------------------ *
 * やくそく（open loop）
 * ------------------------------------------------------------------ */

export function createCommitment(db, input = {}, now = new Date()) {
  const nowIso = now.toISOString();
  const commitment = {
    id: randomUUID(),
    title: str(input.title, 'やくそくの内容', { max: LIMITS.title, required: true }),
    owner: enumOf(input.owner, OWNER_KEYS, '担当', 'partner'),
    due: optionalDay(input.due, '期限'),
    steps: normalizeSteps(input.steps),
    status: 'open',
    doneAt: null,
    dropReason: '',
    interactionId: requireRef(db.interactions, input.interactionId, 'やりとり'),
    goalId: requireRef(db.goals, input.goalId, '目標'),
    reminders: [],
    note: str(input.note, 'メモ', { max: LIMITS.note }),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.commitments.push(commitment);
  return commitment;
}

export function updateCommitment(db, id, patch = {}, now = new Date()) {
  const target = db.commitments.find((item) => item.id === id);
  if (!target) throw new NotFoundError(`やくそくが見つかりません: ${id}`);
  const nowIso = now.toISOString();

  if (patch.title !== undefined) {
    target.title = str(patch.title, 'やくそくの内容', { max: LIMITS.title, required: true });
  }
  if (patch.owner !== undefined) target.owner = enumOf(patch.owner, OWNER_KEYS, '担当', target.owner);
  if (patch.due !== undefined) target.due = optionalDay(patch.due, '期限');
  if (patch.steps !== undefined) target.steps = normalizeSteps(patch.steps);
  if (patch.note !== undefined) target.note = str(patch.note, 'メモ', { max: LIMITS.note });
  if (patch.goalId !== undefined) target.goalId = requireRef(db.goals, patch.goalId, '目標');
  if (patch.interactionId !== undefined) {
    target.interactionId = requireRef(db.interactions, patch.interactionId, 'やりとり');
  }

  if (patch.status !== undefined) {
    const status = enumOf(patch.status, COMMITMENT_STATUSES, '状態', target.status);
    if (status === 'done' && target.status !== 'done') {
      target.doneAt = optionalIso(patch.doneAt, '完了日時', nowIso);
      target.dropReason = '';
    }
    if (status === 'dropped') {
      target.doneAt = null;
      target.dropReason = str(patch.dropReason, 'やめた理由', { max: LIMITS.note });
    }
    if (status === 'open') {
      target.doneAt = null;
      target.dropReason = '';
    }
    target.status = status;
  } else if (patch.dropReason !== undefined) {
    target.dropReason = str(patch.dropReason, 'やめた理由', { max: LIMITS.note });
  }

  // 「もう一度伝えた」を記録する。何度言っても進まない約束は伝え方の問題として浮かせたい。
  if (patch.addReminder) {
    const note = typeof patch.addReminder === 'string' ? patch.addReminder : '';
    target.reminders.push({
      at: nowIso,
      note: str(note, '伝え直しメモ', { max: LIMITS.note }),
    });
  }

  target.updatedAt = nowIso;
  return target;
}

export function deleteCommitment(db, id) {
  const index = db.commitments.findIndex((item) => item.id === id);
  if (index === -1) throw new NotFoundError(`やくそくが見つかりません: ${id}`);
  return db.commitments.splice(index, 1)[0];
}

/* ------------------------------------------------------------------ *
 * 長期目標
 * ------------------------------------------------------------------ */

export function createGoal(db, input = {}, now = new Date()) {
  const nowIso = now.toISOString();
  const goal = {
    id: randomUUID(),
    title: str(input.title, '目標', { max: LIMITS.title, required: true }),
    why: str(input.why, 'なぜ大事か', { max: LIMITS.why }),
    targetDate: optionalDay(input.targetDate, '目標期日'),
    status: enumOf(input.status, GOAL_STATUSES, '状態', 'active'),
    sharedWithHim: input.sharedWithHim === true,
    milestones: normalizeMilestones(input.milestones),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.goals.push(goal);
  return goal;
}

export function updateGoal(db, id, patch = {}, now = new Date()) {
  const target = db.goals.find((item) => item.id === id);
  if (!target) throw new NotFoundError(`目標が見つかりません: ${id}`);

  if (patch.title !== undefined) {
    target.title = str(patch.title, '目標', { max: LIMITS.title, required: true });
  }
  if (patch.why !== undefined) target.why = str(patch.why, 'なぜ大事か', { max: LIMITS.why });
  if (patch.targetDate !== undefined) target.targetDate = optionalDay(patch.targetDate, '目標期日');
  if (patch.status !== undefined) {
    target.status = enumOf(patch.status, GOAL_STATUSES, '状態', target.status);
  }
  if (patch.sharedWithHim !== undefined) target.sharedWithHim = patch.sharedWithHim === true;
  if (patch.milestones !== undefined) target.milestones = normalizeMilestones(patch.milestones);

  target.updatedAt = now.toISOString();
  return target;
}

export function deleteGoal(db, id) {
  const index = db.goals.findIndex((item) => item.id === id);
  if (index === -1) throw new NotFoundError(`目標が見つかりません: ${id}`);
  const [removed] = db.goals.splice(index, 1);
  for (const c of db.commitments) if (c.goalId === id) c.goalId = null;
  for (const i of db.interactions) if (i.goalId === id) i.goalId = null;
  return removed;
}

/* ------------------------------------------------------------------ *
 * 設定
 * ------------------------------------------------------------------ */

export function updateSettings(db, patch = {}) {
  const next = { ...db.settings };
  if (patch.partnerName !== undefined) {
    next.partnerName = str(patch.partnerName, '兄の呼び名', { max: 40, required: true });
  }
  if (patch.myName !== undefined) {
    next.myName = str(patch.myName, '自分の呼び名', { max: 40, required: true });
  }
  if (patch.tz !== undefined) {
    const tz = str(patch.tz, 'タイムゾーン', { max: 64, required: true });
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    } catch {
      throw new ValidationError(`タイムゾーンが不正です: ${tz}`);
    }
    next.tz = tz;
  }
  for (const key of ['maxOpenAtOnce', 'staleDays', 'contactGapDays', 'goalStallDays', 'noDueNudgeDays']) {
    if (patch[key] === undefined) continue;
    const n = Number(patch[key]);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      throw new ValidationError(`${key} は1〜365の整数で指定してください`);
    }
    next[key] = n;
  }
  db.settings = next;
  return next;
}
