// repo-tour シーンスキーマ。絵コンテ承認後に機械変換される scenes.json が唯一の入力。
// 用語はリポジトリの CONTEXT.md「リポジトリ説明動画(repo-tour)」セクションを参照。

export type KenBurns = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export type TtsMeta = {
  // Gemini TTS のプリビルトボイス名(例: Kore)
  voiceName: string;
  // 読み方の指示。ナレーション本文の前に付く
  stylePrompt?: string;
  model?: string;
  // クレジット表記。規約上必須なエンジン(VOICEVOX等)に切り替えた場合は必ず設定する
  credit?: string;
};

export type Meta = {
  repoName: string;
  title: string;
  date: string;
  fps: number;
  width: number;
  height: number;
  tts: TtsMeta;
};

export type TitleVisual = {
  title: string;
  subtitle?: string;
};

export type DiagramNode = {
  id: string;
  label: string;
  emoji?: string;
  col: number;
  row: number;
};

export type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
};

export type DiagramVisual = {
  caption?: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  // ナレーションに同期した段階表示。要素IDのグループを順に出現させる。
  // エッジのIDは "<from>-<to>-edge"。reveal に含まれない要素は最初から表示。
  reveal: string[][];
};

export type StoryVisual = {
  // genimage.mjs が生成後に書き込む。未生成時はプレースホルダを描画(絵コンテ確認用)。
  imageFile?: string;
  imagePrompt?: string;
  kenBurns: KenBurns;
  caption?: string;
};

export type CreditsVisual = {
  extraLines?: string[];
};

type SceneBase = {
  id: string;
  narration: string;
  // tts.mjs が wav 実測から書き戻す。Remotion はこの値を最優先で信頼する。
  audioFile?: string;
  audioSec?: number;
  durationInFrames?: number;
  // ナレーション無しシーン(クレジット等)の尺。絵コンテの尺目安に対応。
  durationSecHint?: number;
};

export type Scene =
  | (SceneBase & {type: 'title'; visual: TitleVisual})
  | (SceneBase & {type: 'diagram'; visual: DiagramVisual})
  | (SceneBase & {type: 'story'; visual: StoryVisual})
  | (SceneBase & {type: 'credits'; visual: CreditsVisual});

export type RepoTourProps = {
  meta: Meta;
  scenes: Scene[];
};

// シーン尺の解決。tts.mjs 実行済みなら実測値、未実行なら目安値(文字数÷6+1秒、最低3秒)。
export const sceneDuration = (scene: Scene, fps: number): number => {
  if (scene.durationInFrames) {
    return scene.durationInFrames;
  }
  const hintSec =
    scene.durationSecHint ?? Math.max(3, scene.narration.length / 6 + 1);
  return Math.ceil(hintSec * fps);
};
