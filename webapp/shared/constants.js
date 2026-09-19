/**
 * サーバーとブラウザの両方が読む定義。
 * 選択肢の意味はここが単一の真実源で、表示ラベルも分析キーもここから引く。
 *
 * このツールが扱うのは、特定の相手ではなく「1対1で、口約束が消える関係」全般。
 * 親と子、上司と部下、支援する側とされる側、介護、担当者と顧客。
 * 関係が変われば適量も変わるので、件数や日数のしきい値はすべて設定で動かせる。
 *
 * 言葉づかいの原則:
 *   記録するのは相手の欠点ではなく、こちらの伝え方。だから選択肢の主語は
 *   すべて「伝えた側」に置き、相手を評価する語（できない・だらしない・
 *   こじれた）を選択肢に持たせない。画面を相手が覗き込む場面は必ず来るし、
 *   評価されていると感じた瞬間に、この道具は使えなくなる。
 */

export const CHANNELS = [
  { key: 'face', label: '対面' },
  { key: 'line', label: 'LINE・チャット' },
  { key: 'phone', label: '電話' },
  { key: 'other', label: 'その他' },
];

/**
 * その日の様子（記録者から見た見え方）。1 = 疲れていそう 〜 5 = 元気そう
 * 相手の評価ではなく「今日は重い話をしていい日か」を後から思い出すための目印。
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
 * 相手の言葉で言い直せたか（readback）までいって初めて、伝わったと数える。
 */
export const UNDERSTANDING_LEVELS = [
  { key: 'none', label: '確認していない', weight: 0 },
  { key: 'asked', label: '「わかった？」と聞いた', weight: 1 },
  { key: 'readback', label: '相手の言葉で言い直せた', weight: 2 },
];

/**
 * 伝わりにくさ。急かした日・重ねすぎた日を後から見つけるために残す。
 * 「こじれた」「ぐずった」のような相手を主語にした語は置かない。
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
  label: '相手の言葉で言い直してもらった',
  hint: '伝わったかを確かめる最強の一手',
};

export const OWNERS = [
  { key: 'partner', label: '相手' },
  { key: 'me', label: '自分' },
  { key: 'both', label: 'いっしょに' },
];

export const COMMITMENT_STATUSES = ['open', 'done', 'dropped'];
export const GOAL_STATUSES = ['active', 'achieved', 'paused'];

/**
 * このツールの立て付け。画面にもそのまま出す。
 *
 * 説明資料にだけ書いて画面に出さないと、使っているうちに
 * 「相手ができなかったことの台帳」に戻っていく。戻らないように、
 * 何を数えていて何を数えていないかを、初回と設定画面に置いておく。
 */
export const CONCEPT = {
  headline: '記録するのは、相手のことではありません',
  records: [
    '一度に何件渡したか',
    '書いて渡したか',
    '急かさずに時間を取ったか',
    '相手の言葉で戻ってきたか',
  ],
  notRecords: ['できなかったこと', '苦手なことの一覧', '相手への点数や評価'],
  note: '数えているのはこちらの伝え方だけです。うまくいかなかったとき、直す場所はいつも自分の側にあります。',
};

/**
 * 伝える側が守る約束。相手に課すルールは1つも作らない。
 * 件数のように設定で変わる数字は文面に埋めず、画面側で補う。
 */
export const DELIVERY_RULES = [
  {
    key: 'no_rush',
    title: '急かさない',
    avoid: '「早く」「まだ？」を重ねる',
    instead: '日付を余裕をもって決める',
  },
  {
    key: 'praise_first',
    title: 'できていないことから話さない',
    avoid: '未達の確認から入る',
    instead: 'できたことを先に置く',
  },
  {
    key: 'not_in_public',
    title: '人前で確認しない',
    avoid: 'その場で答えさせる',
    instead: '文字にして渡す',
  },
  {
    key: 'cap',
    title: '一度に渡しすぎない',
    avoid: '思いついた順に足す',
    instead: '上限を超えたぶんはこちらで預かる',
  },
  {
    key: 'no_why',
    title: '「なんで」で始めない',
    avoid: '理由を問いただす',
    instead: '「いつやる？」に置き換える',
  },
];

/** 記録の書き方。主語を自分にすると、そのまま次に直す場所になる */
export const WRITING_EXAMPLES = [
  { avoid: 'また忘れてた', instead: '口頭だけで伝えた。文字にしていない' },
  { avoid: '話が通じない', instead: '一度に3件渡した。1件目しか残らなかった' },
  { avoid: 'やる気がない', instead: '日付を当日に置いた。取りかかる時間がなかった' },
];

export const DEFAULT_SETTINGS = {
  tz: 'Asia/Tokyo',
  partnerName: '相手',
  myName: '自分',
  /**
   * 相手に同時に渡しておく依頼の上限。超えたら警告する。
   * 既定の3は「口頭で渡して確実に残る件数」の目安。相手によって変わるので設定で動かす。
   */
  maxOpenAtOnce: 3,
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
