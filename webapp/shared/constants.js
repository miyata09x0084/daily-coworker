/**
 * サーバーとブラウザの両方が読む定義。
 * 選択肢の意味はここが単一の真実源で、表示ラベルも分析キーもここから引く。
 *
 * 設計の前提（WAIS プロフィール由来）:
 *   言語理解 = 平均 / 知覚推理・ワーキングメモリ・処理速度 = 平均以下
 *   → 「一度にいくつ渡したか」「書いて渡したか」「本人の言葉で戻ってきたか」を
 *     記録できることが、この設計のいちばん大事な部分。
 *
 * 言葉づかいの原則:
 *   記録するのは本人の欠点ではなく、こちらの渡し方。だから選択肢の主語は
 *   できるだけ「伝えた側」に置き、本人を評価する語（できない・だらしない・
 *   こじれた）を選択肢に持たせない。画面を本人が覗き込む場面は必ず来るし、
 *   評価されていると感じた瞬間が、いちばん荒れる。
 */

export const CHANNELS = [
  { key: 'face', label: '対面' },
  { key: 'line', label: 'LINE・チャット' },
  { key: 'phone', label: '電話' },
  { key: 'other', label: 'その他' },
];

/**
 * その日の様子（記録者から見た見え方）。1 = 疲れていそう 〜 5 = 元気そう
 * 本人の評価ではなく「今日は重い話をしていい日か」を後から思い出すための目印。
 */
export const CONDITIONS = [
  { value: 1, label: 'かなり疲れていそう' },
  { value: 2, label: 'すこし疲れていそう' },
  { value: 3, label: 'ふつう' },
  { value: 4, label: '落ち着いている' },
  { value: 5, label: '元気そう' },
];

/**
 * 理解確認のレベル。
 * ワーキングメモリが弱い相手に「わかった？」と聞くと反射的に「わかった」と返ることが多い。
 * 本人の言葉で言い直せたか（readback）までいって初めて、伝わったと数える。
 */
export const UNDERSTANDING_LEVELS = [
  { key: 'none', label: '確認していない', weight: 0 },
  { key: 'asked', label: '「わかった？」と聞いた', weight: 1 },
  { key: 'readback', label: '本人の言葉で言い直せた', weight: 2 },
];

/**
 * 伝わりにくさ。急かした日・重ねすぎた日を後から見つけるために残す。
 * 「こじれた」「ぐずった」のような本人を主語にした語は置かない。
 * うまくいかなかったのは伝え方のほうだ、という立て付けを崩さないため。
 */
export const FRICTIONS = [
  { key: 'none', label: 'すんなり通った' },
  { key: 'some', label: 'すこし伝わりにくかった' },
  { key: 'hard', label: 'うまく伝えられなかった' },
];

/**
 * 伝え方の工夫。どれが実際に完了率を上げたかを後から突き合わせる。
 * 「良い伝え方」を思い込みでなく、自分たちのデータで決めるための軸。
 */
export const TECHNIQUES = [
  { key: 'one_at_a_time', label: '1回に1つだけ伝えた', hint: 'ワーキングメモリの負荷を下げる' },
  { key: 'written', label: '書いて渡した', hint: '口頭だけにしない' },
  { key: 'steps', label: '手順に分けた', hint: '1手順=1動作まで割る' },
  { key: 'concrete_date', label: '期限を具体的な日付で言った', hint: '「早めに」を使わない' },
  { key: 'no_rush', label: '急かさず待った', hint: '処理速度の差を時間で埋める' },
  { key: 'choice', label: '選択肢を2つに絞った', hint: '自由回答より決めやすい' },
  { key: 'praise', label: 'できたことを先に認めた', hint: '否定から入らない' },
  { key: 'quiet_place', label: '静かな場所で話した', hint: '注意がそれる要因を減らす' },
];

/** readback は understanding から導出する擬似テクニック。効き目の比較対象に加える */
export const DERIVED_TECHNIQUE_READBACK = {
  key: 'readback',
  label: '本人の言葉で言い直してもらった',
  hint: '伝わったかを確かめる最強の一手',
};

export const OWNERS = [
  { key: 'him', label: '兄' },
  { key: 'me', label: 'わたし' },
  { key: 'both', label: 'ふたりで' },
];

export const COMMITMENT_STATUSES = ['open', 'done', 'dropped'];
export const GOAL_STATUSES = ['active', 'achieved', 'paused'];

export const DEFAULT_SETTINGS = {
  tz: 'Asia/Tokyo',
  himName: '兄',
  myName: 'わたし',
  /** 兄に同時に持たせる約束の上限。超えたら警告する（WM への配慮） */
  maxOpenForHim: 3,
  /** 何日動きがなければ「止まっている」と見なすか */
  staleDays: 7,
  /** 何日記録がなければ「連絡が途切れている」と見なすか */
  contactGapDays: 4,
  /** 目標に何日紐づく動きがなければ停滞と見なすか */
  goalStallDays: 30,
  /** 期限なしの約束を何日で「期限を決めよう」と促すか */
  noDueNudgeDays: 3,
};

export const LIMITS = {
  summary: 1000,
  title: 200,
  note: 2000,
  why: 1000,
  steps: 12,
  stepText: 200,
  milestones: 20,
};

export function labelOf(list, key) {
  const hit = list.find((item) => item.key === key || item.value === key);
  return hit ? hit.label : String(key ?? '');
}
