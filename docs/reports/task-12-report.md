# Task 12 公開リリース準備報告

## 変更内容

- 日本語を先頭にした README、MIT License、アーキテクチャ、JSON 形式、カタログ拡張、アセット方針、第三者通知を追加しました。
- 実在する Future Workstation テンプレートから、固定時刻と固定 ID で公開サンプルを生成します。`sample:generate` と `sample:check` は同じ正規化エクスポーターを使います。
- `check:repo` は追跡済みファイルだけを検査し、公開必須ファイル、相対リンク、資格情報、ローカル絶対パス、実行時ネットワーク API、未記載のバイナリアセット、古いサンプルを検出します。テスト、fixture、文書例、検査器自身は用途を限定して除外しています。
- Vite の相対 `base` と、`/apartment-planner/` 配下を実際に配信する静的サーバーを追加しました。ブラウザ試験は初期 JavaScript と遅延読み込みした SceneCanvas のアセット URL がともに 2xx であることを添付記録します。
- CI は Node 22、`contents: read`、デプロイなしで、サンプル、スキャナー、整形、lint、型、単体、ビルド、Chromium E2E を直列に実行します。

## 検証環境と結果

Windows、Node.js v22.22.0、Playwright Chromium 151.0.7922.34 (Win64) で確認しました。

- `npm.cmd run sample:check`: 成功
- `npm.cmd run check:repo`: 成功
- `npm.cmd test`: 183 tests passed
- `npm.cmd run typecheck`: 成功
- `npm.cmd run lint`: 成功
- `npm.cmd run format:check`: 成功
- `npm.cmd run build`: 成功
- `npm.cmd run test:e2e`: 15/15 passed、53.8 秒
- 静的サブパス試験: `/apartment-planner/assets/*` の初期・遅延 JavaScript を記録し、すべて 2xx

ビルド時のエントリーは 339,123 bytes raw / 98,902 bytes gzip、遅延 SceneCanvas は 986,202 bytes raw / 265,572 bytes gzip でした。初期エントリーは 500 kB 未満です。

## 判断と残る注意点

公開サンプルは機械可読な正規化形式を最優先するため、Prettier の対象から外しています。`sample:check` が整形・更新の代わりに正確な内容を保証します。

Vite は遅延レンダラーチャンクが 500 kB を超える警告を出します。これは既存の Three.js レンダラーであり、初期エントリーとは分離済みです。マニフェストとブラウザの遅延読み込み試験で分離を確認しています。
