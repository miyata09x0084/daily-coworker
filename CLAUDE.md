# daily-coworker — AI生産性アシスタント

## プロジェクト概要

個人の生産性を最大化するためのAIアシスタントワークスペース。
スケジュール管理、リサーチ、記事作成、記憶管理を統合する。

## ディレクトリ構成

```
00_context/          # プロフィール、AI記憶
  memories/
    preferences.md   # ユーザーの好み・設定
    decisions.md     # 意思決定ログ
    context-log.md   # セッション間コンテキスト
    case-judgment-framework.md  # 判断基準
01_strategy/         # ビジネス戦略
output/              # AI出力ファイル
  research/          # リサーチ結果
  articles/          # 記事
```

## スキル

各機能は **skill が実装本体**。自然言語トリガーで自動発火するほか、`/<name>` の明示起動でも呼び出せる（slash commands は skills に統合されたため、command エイリアス層は置かない）。

| skill          | 自然言語トリガー                       | 明示起動         | 動作                                       |
| -------------- | -------------------------------------- | ---------------- | ------------------------------------------ |
| daily-schedule | 「おはよう」「今日の予定」             | /daily-schedule  | Google Calendar連携で1日のスケジュール作成 |
| tech-news      | 「テックニュース」「ニュース」         | /tech-news       | 複数ソース並列取得＋横断インサイト抽出     |
| deep-research  | 「〜について調べて」「リサーチして」   | /deep-research   | 6エージェント体制でリサーチチーム起動      |
| write-article  | 「〜について記事を書いて」「ブログ書いて」 | /write-article | 5フェーズで記事作成チーム起動              |
| reply-email    | 「メール返信」「このメールに返信して」 | /reply-email     | 文体ガイドに基づき返信案を1案生成(初回は文体セットアップ) |
| agent-memory   | 「覚えておいて」「メモして」           | /agent-memory    | 発言内容を分類してAI記憶ファイルに保存     |
| ai-leverage    | 「今日のAI」「AIレバレッジ」           | /ai-leverage     | AI一次情報をSWE視点の「インサイト→アクション」に変換 |
| ai-mentors     | 「AI開発者の動向」「メンターの発信」   | /ai-mentors      | AI第一人者の発信を差分取得し「観察→写像」でデイリーレポート化 |

## コンテキスト管理

- セッション開始時: `00_context/memories/` の関連ファイルを確認する
- セッション終了時: 重要な決定・発見を記録するか確認する
- コンテキストが圧迫されたら正直に宣言して中断する

## コミュニケーションスタイル

- 結論ファースト
