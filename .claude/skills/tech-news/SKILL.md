---
name: tech-news
description: ALWAYS invoke when the user asks for tech news. 「テックニュース」「ニュース」を検知したら、直接検索せず必ずこのスキルを起動する。news-sources.yaml に定義された複数ソースの並列取得と横断インサイト抽出が必須のため。
---

# テックニュース斜め読み

ニュースソースは `.claude/skills/tech-news/news-sources.yaml` に**宣言的に定義**されている。
新しいソース追加は SKILL.md 編集不要、YAML に entry を 1 つ足すだけで済む。

## 手順

### 0. 設定の読み込み

1. `.claude/skills/tech-news/news-sources.yaml` を Read する
2. `${VAR}` 表記があれば `.env`（gitignore対象）を Read して展開する（現状は公開URLのみで `.env` 不要）

以降の手順では、この設定のみを使う。ハードコード禁止。

### 1. ニュース取得（ソース並列）

`sources` 配列の各 entry について **並列で** エージェントを起動する。
取得フローは以下 2 軸の直交する分岐で決まる:

- **トランスポート (`fetch.tool`)**: どのツールで URL を叩くか
- **戦略 (`fetch.strategy`)**: 返ってきたデータをどう解釈するか

#### トランスポートディスパッチ

`fetch.tool` の値で取得ツールを切り替える (未指定時は `webfetch`):

- **`webfetch`**: WebFetch で URL を取得する（HN・TechCrunch 等、ブロックされないサイト向け）
- **`curl`**: Bash で `curl -s -A "${fetch.user_agent}" "${URL}"` を実行する
  （Reddit 等、WebFetch がブロックされるサイト向け。`fetch.user_agent` が必須）

#### 戦略ディスパッチ

**`list-then-detail` (例: Hacker News)**

```
1. トランスポートで fetch.list_url を取得 → ID/キーのリストを得る
2. 先頭 limit 件について、fetch.detail_url_template 内の {id} を
   実際のIDに置換して、同じトランスポートで取得
3. 各詳細レスポンスから extract.title / extract.url / extract.score
   のパスで値を取り出す
```

**`rss` (例: TechCrunch)**

```
1. トランスポートで fetch.url を取得 → RSS フィードを得る
2. フィード内の先頭 limit 件の <item> について、
   extract.title / extract.url / extract.score のパス
   (= XMLタグ名) で抽出
3. extract.score が null の場合は score を null のまま返す
```

**`json-list` (例: Reddit)**

```
1. トランスポートで fetch.url を取得 → JSON を得る
2. fetch.list_path (例: "data.children") までナビゲート → 記事配列を得る
3. 先頭 limit 件について、extract.title / extract.url / extract.score
   のパス (配列要素内の相対パス) で抽出
```

**共通の返却項目:**

```
- title: 記事タイトル
- url: 記事URL
- score: スコア (null 可)
- source_name: ソース名 (entry の name フィールド)
- tag_template: タグのテンプレート (entry の tag_template フィールド)
```

### 2. 統合・要約・分析

3 エージェントの結果を受け取り、以下の処理を行う:

1. **重複除去**: 同じ URL、またはタイトルが非常に似ている記事を除外
2. **日本語要約**: 各記事のタイトルから内容を推測し、1〜2 行で要約
3. **ソート**: score がある記事は score 降順、ない記事は取得順
4. **件数調整**: 設定 `output.final_count_range`（例: 10〜20 件）に収まるよう調整
5. **横断分析**: ニュース全体を俯瞰し、設定 `insights` に従ってインサイトを抽出:
   - 件数: `insights.count`（例: 3 つ）
   - 各インサイトは `insights.axes` に列挙された観点（例: 技術トレンド / 業界構造）から選ぶ
   - 形式:
     - **何が起きているか**（必ず複数記事を横断して書く。1 記事だけの話はインサイトではない）
     - **So what?**（エンジニア/技術選定の観点で、具体的に何を意味するか）

### 3. 出力

以下のフォーマットでターミナルに表示する:

```markdown
# Tech News Digest — {今日の日付}

1. **[記事タイトル](URL)** — 日本語要約1-2行 {tag_template の展開後}
2. **[記事タイトル](URL)** — 日本語要約1-2行 {tag_template の展開後}
...

---

## Insights

1. **{インサイトのタイトル}**
   {何が起きているか — 関連記事番号を括弧で参照}
   → {So what? — 技術選定・キャリア・ビジネス判断への示唆}

2. **{インサイトのタイトル}**
   ...

---
Sources: {sources[*].name を "、" で連結}
```

**タグテンプレートのルール:**
- 記事ごとに source の `tag_template` を展開する
- `{score}` プレースホルダを実際の score 値に置換（score が null の場合はタグから score 部分を省略可）

**インサイトのルール:**
- 必ず複数記事を横断して書く（1 記事だけのものはインサイトではなくただの要約）
- 「〜が話題です」で終わらせず、**判断・行動につながる示唆**を書く
- `insights.count` の数に絞る。数を増やすより質を上げる

### 4. 保存

結果を以下のパスに保存する:

```
{output.dir}/{output.filename_pattern の {date} を今日の日付 YYYY-MM-DD に置換}
```

現設定では `output/news/YYYY-MM-DD-tech-news.md` となる。

## 新しいソースを追加する場合

1. `.claude/skills/tech-news/news-sources.yaml` の `sources:` 配列に entry を追加（公開URLは直接記載）
   - 既存 3 つのいずれかの `fetch.strategy` に該当すれば、新コードは不要
   - 該当しない新しい取得パターンなら、この SKILL.md に新 strategy の処理ブロックを追記
2. skill 本体のロジックには手を入れなくて良い（戦略ディスパッチの恩恵）
