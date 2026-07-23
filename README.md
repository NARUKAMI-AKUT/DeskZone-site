# DeskZone (Webアプリ)

Windowsデスクトップのアイコンをゾーン分けする壁紙を、ブラウザだけで作る完全クライアントサイドアプリ。
ビルド不要・外部依存ゼロ・画像はどこにも送信されない。

## 起動

    cd webapp && python3 -m http.server 8000

ブラウザで http://localhost:8000 を開く(ES modulesのためfile://では動かない)。

## 構成

- `js/gridcalc.js` `js/zones.js` `js/state.js` `js/coverfit.js` — 純ロジック(DOM非依存)
- `js/render.js` — Canvas描画(プレビューと最終出力で共通)
- `js/export.js` — 出力ゲート`runExport()`(将来の広告/有料版のフックポイント)
- `js/ui-canvas.js` `js/ui-panel.js` `js/main.js` — UI

## テスト

    node --test "tests/webapp/**/*.test.mjs"   # リポジトリルートから
