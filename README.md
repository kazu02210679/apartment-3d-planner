# Apartment 3D Planner

## Web 版を開く

[Apartment 3D Planner をブラウザで開く](https://kazu02210679.github.io/apartment-3d-planner/)

インストールは不要です。上のリンクを Chrome または Edge で開いてください。初回は 3D レンダラーの読み込みに少し時間がかかる場合があります。シーンはブラウザの Local Storage に保存されるため、別の端末やブラウザとは自動同期されません。

ローカルファーストで使える、住まいとワークステーションのための 3D 配置プランナーです。家具、機器、ポート、ケーブルをミリメートル単位で配置し、ブラウザ内で保存・書き出し・読み込みできます。

現在はサーバー、アカウント、分析、外部アセット取得を持ちません。シーンはブラウザの Local Storage に保存され、必要に応じて JSON として手元に書き出せます。

## すぐに試す

Node.js 22 以降と Chromium が必要です。

```sh
npm ci
npm run dev
```

開発サーバーに表示されたローカル URL をブラウザで開きます。公開用の決定的サンプルはソースツリーでは [`public/samples/future-workstation-apartment.json`](public/samples/future-workstation-apartment.json) にあります。ビルドを相対パス配下へ配置した場合の URL は `./samples/future-workstation-apartment.json`（アプリの配置先からの相対 URL）です。

```sh
npm run sample:check
npm run check:repo
npm run build
npm run test:e2e
```

`npm run sample:generate` は同じ Future Workstation テンプレート、固定 ID、固定時刻からサンプルを再生成します。意図しないサンプル差分は `sample:check` で検出されます。

## 主な操作

- カタログから家具・機器・ケーブルを追加し、アウトライナーまたはキャンバスで選択します。
- 移動、回転、サイズ変更、ロック・非表示を編集します。数値入力は Enter で確定できます。
- ケーブルモードではポートを接続し、自由端と経由点を編集できます。Esc は編集中のドラフトを破棄します。
- `編集` と `高品質プレビュー` を切り替え、JSON のエクスポート／インポート、Undo／Redo を使えます。

## ドキュメント

- [アーキテクチャ](docs/architecture.md)
- [シーン JSON 形式](docs/scene-format.md)
- [カタログ拡張ガイド](docs/catalog-extension.md)
- [アセットとライセンス](docs/assets.md)
- [第三者ソフトウェア通知](THIRD_PARTY_NOTICES.md)
- [受け入れワークフロー報告](docs/reports/task-11-report.md)
- [公開リリース準備報告](docs/reports/task-12-report.md)

## 開発と検証

`npm run test` は単体・統合テスト、`npm run test:e2e` は本番ビルドを Chromium で確認します。後者は `dist` を `/apartment-planner/` 配下でも配信する小さな静的サーバーを使い、初期チャンクと遅延読み込みされる 3D レンダラーの両方を確認します。証跡の生成・監査は通常E2Eから分離し、必要なときだけ `npm run test:e2e:evidence` を実行します。

`npm run check:repo` は追跡済みファイルだけを対象に、公開必須ファイル、相対 Markdown リンク、資格情報らしいファイル・文字列、ローカル絶対パス、実行時ネットワーク API、未記載のバイナリアセット、古い公開サンプルを検査します。テスト、fixture、文書例、検査器自身の正規表現は限定的に除外します。失敗時に値そのものは出力しません。

## 編集と高品質プレビュー

- `編集` はカタログ、インスペクター、選択、ギズモを使う正本編集画面です。
- `高品質プレビュー` は同じ SceneDocument を読むライブ表示で、カタログ、インスペクター、選択表示、編集グリッド、配置補正を隠した読み取り専用モードです。`編集に戻る` で戻れます。切り替えでは JSON、Undo／Redo、Local Storage 自動保存を変更しません。
- 編集モードでフォーカス可能なキャンバスへフォーカスがある状態で `End` を押すと、カタログの優先設置面（なければ許可された床）へ最寄りの有効位置に補正します。`Shift+End` は部屋の床へ補正します。右クリックの補正メニューは `範囲内に戻す`、`最寄りの支持面に置く`、`床に置く` の最大 3 操作です。ロック、非表示、入力欄、メニュー、ダイアログ、IME 中は実行しません。
- プレビューは外部ネットワークに依存せず、端末負荷に応じて High／Balanced／Safe の順に品質を下げます。これは写実的な静止画レンダーではありません。`フォトレンダー（静止画）` はこの版では提供していません。

## 制約と注意

これは視覚的な配置計画ツールです。建築確認、耐荷重、避難、電気容量、配線規格、ケーブル負荷、施工可否を検証するものではありません。製品 URL は説明用の不活性な文字列で、アプリは取得しません。ホスト型同期、バックエンド、共同編集は提供していません。

## ライセンス

このリポジトリのソースコードは [MIT License](LICENSE) です。バンドルされる第三者依存関係については [第三者ソフトウェア通知](THIRD_PARTY_NOTICES.md) を参照してください。
