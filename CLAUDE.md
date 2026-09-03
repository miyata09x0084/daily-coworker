# daily-coworker — AI生産性アシスタント

個人の生産性を最大化するAIアシスタントワークスペース。
リポジトリは public。仕組み(スキル定義)は追跡し、個人データ(文体ガイド・記憶・戦略の実体)は gitignore で管理外に置く。

## ディレクトリ構成

```
00_context/memories/  # AI記憶(好み・意思決定・セッション間ログ・判断基準)
01_strategy/          # ビジネス戦略
output/               # AI出力(research/ リサーチ、articles/ 記事)
```

## スキル

各機能は **skill が実装本体**(`.claude/skills/`)。トリガーと動作は各スキルの frontmatter `description` が単一の真実源で、自然言語で自動発火するほか `/<name>` でも起動できる。command エイリアス層は置かない(slash commands は skills に統合済み)。
