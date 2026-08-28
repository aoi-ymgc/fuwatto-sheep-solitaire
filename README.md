# ふわっとひつじのソリティア

オリジナルの「ふわっとひつじ」トランプを使った、ブラウザで遊べるクロンダイク・スパイダー・フリーセルのカードゲーム集です。

## 使用技術

- HTML / CSS / JavaScript（ES Modules）
- Pointer Events によるマウス・タッチ対応ドラッグ操作
- Web Audio API による控えめな効果音
- localStorage によるベスト記録・途中盤面の保存
- Cloudflare Workers Static Assets

## 遊び方

- クロンダイクは赤黒を交互に、数字をひとつずつ下げて重ねます。
- スパイダーは同じスートの K から A を完成させると組を取り除けます。
- フリーセルは4つの空きセルを使い、全カードを組札へ揃えます。

## 実装上のポイント

- `js/cards.js` / `js/deck.js` はカード情報・52枚デッキ・Fisher-Yates シャッフルを共有します。
- `games/solitaire/rules.js` はクロンダイク固有の合法手判定、`solitaire.js` は状態管理とUIを担当します。DOMをゲームの正本にしていません。
- Tableau / Stock / Waste / Foundation の操作、複数カード移動、表返し、UNDO、ヒント、タイマー、スコア、ゲームクリア判定を搭載しています。移動できる表向きカードはワンクリック／タップで、Foundation優先・次にTableauへ自動配置します。残りの全カードをFoundationへ送れると判定できたときは、自動で揃えてクリアします。
- スコアは一般的なクロンダイク方式です。Foundationへ移動 +10、WasteからTableauへ移動 +5、場札を表返し +5、FoundationからTableauへ戻す -15、1枚めくりで山札を戻す -100（0点未満にはなりません）。
- BEST記録（最短タイム・最少手数・最高スコア・プレイ回数・クリア回数）とゲーム途中状態はlocalStorageに保存します。
- カード素材は完成済みのオリジナルカードのWeb用最適化版をそのまま使用し、Jokerはクロンダイクのデッキから除外します。
- タイマー更新では盤面を再描画せず、カード画像もアイドル時に先読みするため、スマートフォンでの操作負荷を抑えています。

## ローカル確認・Cloudflare公開

```bash
npm run check
npm run build
npx wrangler deploy
```

`npm run build` で `public/` に静的サイトを出力します。Cloudflareで公開する前に `wrangler.jsonc` の `name` をユニークな値へ変更してください。

## 共通ランキング API

Cloudflare D1 の `fuwatto-sheep-rankings` にランキングを保存します。初回のみ、マイグレーションを適用してから公開してください。

```bash
npx wrangler d1 migrations apply fuwatto-sheep-rankings --remote
npx wrangler secret put RANKING_RATE_LIMIT_SALT
npm run deploy
```

`RANKING_RATE_LIMIT_SALT` は任意の十分に長いランダム文字列です。未設定でも動作しますが、投稿制限用のIPハッシュを保護するため設定を推奨します。

- `GET /api/rankings?game=solitaire&difficulty=easy`：上位100件を取得
- `POST /api/rankings`：`game`、`difficulty`、`nickname`、`score`、`elapsedTime`、`moves` をJSONで送信

対象の難易度は、クロンダイクが `beginner` / `easy` / `normal` / `hard`、スパイダーが `one` / `two` / `four`、フリーセルが `standard` です。同点はスコア、短時間、少手数、投稿日順で並び、同じIPからの投稿は10分間に6回までに制限します。
