# 一人暮らし3Dシミュレーター v1 実装計画

> **実行方法:** この計画は `superpowers:subagent-driven-development` で順番に実行する。各実装タスクはテストを先に失敗させ、実装後にタスク単位の仕様・品質レビューを通す。

**Goal:** 寸法未確定でも始められ、後から正確な寸法へ移行できる、3D操作と数値編集が双方向同期する一人暮らし向け部屋シミュレーターを、静的配信可能なReactアプリとして公開可能な品質で実装する。

**Architecture:** 永続化可能な `SceneDocument` を唯一の正本とし、React UI、React Three Fiberの編集表示、高品質プレビュー、ローカル保存、JSON入出力をすべて同じIDとコマンド層から駆動する。Three.jsオブジェクト、選択、カメラ、パネル開閉などは一時状態に限定する。カタログ定義とインスタンスを分離し、将来の商品URL・クラウドID・ライブ表示・検証結果を拡張メタデータとして追加できるようにする。

**Tech Stack:** Vite、React、TypeScript strict、React Three Fiber、Three.js、@react-three/drei、Zustand、Immer、Zod、Vitest、Testing Library、Playwright、axe-core、ESLint、Prettier、GitHub Actions。

---

## Global Constraints

- 永続データの正本は、バージョン付きでJSON直列化できる単一の `SceneDocument` とする。Three.js、DOM、関数、循環参照、一時UI状態を混ぜない。
- 永続寸法はミリメートル、永続回転は度。描画層だけでThree.js単位へ変換する。
- 6/8/10/12畳はアプリ内の便宜的な規約として `1畳 = 1.62m²` を明示し、それぞれ `2700×3600×2400`、`3600×3600×2400`、`3600×4500×2400`、`3600×5400×2400` mmを使う。
- 部屋寸法変更は既存エンティティのID、値、階層、変換、カタログ参照、上書き、端子、配線を変更しない。はみ出しは残して警告する。
- 3D操作と数値入力は同じコマンド層を使い、完了した連続操作は履歴1件にまとめ、キャンセルは元に戻して履歴を増やさない。
- 編集モードと高品質プレビューは同じ `SceneDocument` とIDを使い、切替で永続データを変更しない。
- v1はクライアントのみで動作し、初回アセット読込後は外部ネットワーク、アカウント、解析、外部フォント、外部モデル、外部APIを要求しない。
- インポートは信用しない。サイズ・件数・形式・スキーマ・将来版を検証し、コードやHTMLを評価せず、URLを自動取得せず、完全成功時のみシーンを置き換える。
- 代表テンプレートにはL字昇降デスク、Windows、Mac、27インチ主モニター4台、側面情報画面2台、アーム、ディスプレイライト、デスクシェルフ、椅子、収納、プリンター、電源タップ2本、代表配線、ゴミ箱、ベッドまたは布団、小机、照明、衣類収納を含める。
- 公開リポジトリへ機密情報、絶対ローカルパス、再配布不能アセットを含めない。

## Target File Map

```text
.
├─ .github/workflows/ci.yml
├─ docs/
│  ├─ architecture.md
│  ├─ scene-format.md
│  ├─ catalog-extension.md
│  └─ assets.md
├─ e2e/
│  ├─ first-run.spec.ts
│  ├─ editor-sync.spec.ts
│  ├─ persistence.spec.ts
│  ├─ responsive.spec.ts
│  └─ offline.spec.ts
├─ public/samples/future-workstation-apartment.json
├─ src/
│  ├─ app/
│  ├─ catalog/
│  ├─ commands/
│  ├─ domain/
│  ├─ editor/
│  ├─ persistence/
│  ├─ renderer/
│  ├─ test/
│  └─ ui/
├─ README.md
├─ package.json
├─ playwright.config.ts
├─ tsconfig.json
├─ vite.config.ts
└─ vitest.config.ts
```

## Task 1: アプリ基盤と実行可能な縦切り

**Files:**
- Create: `package.json`, `package-lock.json`, `index.html`
- Create: `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- Create: `eslint.config.js`, `.prettierrc.json`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/test/setup.ts`, `src/styles.css`
- Create: `e2e/smoke.spec.ts`

**Steps:**

1. Vite/React/TypeScriptとテスト依存関係を定義し、固定されたlockfileを生成する。スクリプトは `dev`、`build`、`preview`、`typecheck`、`lint`、`format:check`、`test`、`test:watch`、`test:e2e` を提供する。
2. RED: `App.test.tsx` に、タイトル「暮らしの3Dプランナー」、新規シーン導線、編集/プレビュー切替が表示されるテストを書く。`npm test -- src/app/App.test.tsx` を実行し、未実装要素で失敗することを確認する。
3. GREEN: 最小の `App` とレスポンシブなCSSトークンを実装する。1440pxでは3列の編集シェル、狭い幅では中央ビューポート＋下部パネルへ切り替わる土台だけを作る。
4. `npm test -- src/app/App.test.tsx`、`npm run typecheck`、`npm run build` を実行し、警告のない成功を確認する。
5. RED→GREEN: `e2e/smoke.spec.ts` で本番ビルドを開き、タイトルと主要操作が到達可能で、ページエラーがないことを検証する。
6. Commit: `chore: scaffold apartment 3d planner`

## Task 2: SceneDocument、単位、畳プリセット、検証

**Files:**
- Create: `src/domain/scene.ts`, `src/domain/schema.ts`, `src/domain/units.ts`, `src/domain/ids.ts`
- Create: `src/domain/room-presets.ts`, `src/domain/invariants.ts`, `src/domain/normalize.ts`
- Create: `src/domain/schema.test.ts`, `src/domain/room-presets.test.ts`, `src/domain/invariants.test.ts`

**Steps:**

1. RED: 4種類の畳プリセット、mm↔renderer単位、度↔rad変換、安定ID、JSON直列化可能性を検証するテストを書く。期待値はGlobal Constraintsの寸法をそのまま使う。
2. RED: 重複ID、親子循環、存在しない親、存在しない端子参照、NaN/Infinity、将来スキーマ版を拒否するテストを書く。各テストが目的の不足で失敗することを確認する。
3. GREEN: `SceneDocumentSchema` とTypeScript型をZodから一貫して導出し、`format: "home-lab-scene"`、`schemaVersion: 1`、metadata、room、entities、connections、extensionsを定義する。
4. GREEN: `createEmptyScene(preset)`、単位変換、opaque ID生成、`validateSceneInvariants`、`normalizeScene` を実装する。
5. RED→GREEN: 部屋寸法だけを変える `resizeRoom` がエンティティを一切書き換えず、はみ出しIDを返すテストと実装を追加する。
6. `npm test -- src/domain` と `npm run typecheck` を実行する。
7. Commit: `feat: define versioned scene document`

## Task 3: データ駆動カタログと初期テンプレート

**Files:**
- Create: `src/catalog/types.ts`, `src/catalog/catalog.ts`, `src/catalog/dimensions.ts`
- Create: `src/catalog/definitions/*.ts`
- Create: `src/catalog/catalog.test.ts`, `src/catalog/template.test.ts`
- Create: `src/domain/templates/future-workstation.ts`

**Steps:**

1. RED: カタログ定義がID、revision、category、geometry strategy、既定寸法、dimension policy、presets、materials、capabilities、inspector fields、portsを表せることをテストする。
2. RED: 24/27/32インチ16:9モニター寸法を対角線から算出し、丸め誤差1mm以内になることをテストする。
3. GREEN: catalog definitionとscene instanceを分離し、継承値・preset由来値・instance overrideを解決する `resolveCatalogInstance` とリセット関数を実装する。
4. RED: L字昇降デスクのmain top、return top、左右、座位/立位/自由高が、同一IDのまま変更できるfixtureテストを書く。
5. GREEN: 部屋要素、デスク、シェルフ、収納、PC、Mac、mini PC、モニター、情報画面、アーム、ライト、プリンター、電源、ケーブル、ゴミ箱、ベッド/布団、小机、照明、衣類収納のgeneric catalog definitionsを追加する。
6. RED→GREEN: `createFutureWorkstationScene()` がREQ-010のカテゴリと最低個数をすべて含み、全IDとport IDが決定的に一意であることを検証する。
7. `npm test -- src/catalog src/domain/templates` と `npm run typecheck` を実行する。
8. Commit: `feat: add extensible catalog and workstation template`

## Task 4: コマンド層、undo/redo、連続操作

**Files:**
- Create: `src/commands/types.ts`, `src/commands/command-store.ts`, `src/commands/commands.ts`
- Create: `src/commands/history.ts`, `src/commands/transactions.ts`
- Create: `src/commands/command-store.test.ts`, `src/commands/transactions.test.ts`

**Steps:**

1. RED: add、rename、duplicate、delete、visibility、lock、transform、dimensions、preset、room resize、group、ungroup、cable変更が決定的にundo/redoできるテーブルテストを書く。
2. RED: parent cycle拒否、locked entity変更拒否、delete時の参照整合性、local transformの保持を検証する。
3. GREEN: Immer patchまたは明示的inverseを内部で使う `execute(command)`、`undo()`、`redo()` を実装し、UIからの永続変更はここだけを通す。
4. RED: drag中のlive値が見え、commitで履歴1件、cancelで元値復元かつ履歴0件となる `begin/update/commit/cancelInteraction` テストを書く。
5. GREEN: transaction-scoped coalescingを実装し、数値scrubと3D dragが同じ仕組みを利用できるようにする。
6. `npm test -- src/commands` と `npm run typecheck` を実行する。
7. Commit: `feat: add reversible scene command layer`

## Task 5: 安全なautosave、JSON export/import、migration

**Files:**
- Create: `src/persistence/storage.ts`, `src/persistence/autosave.ts`, `src/persistence/export.ts`
- Create: `src/persistence/import.ts`, `src/persistence/migrations.ts`, `src/persistence/limits.ts`
- Create: `src/persistence/*.test.ts`
- Create: `src/domain/fixtures/v0-scene.json`, `src/domain/fixtures/invalid-scenes.ts`

**Steps:**

1. RED: command commit後のdebounced autosave、1秒以内の完了状態、reload復元、保存失敗時のlast-known-good維持をfake storage adapterでテストする。
2. GREEN: `current` と `lastKnownGood` を原子的にローテーションするstorage adapterとautosave coordinatorを実装する。
3. RED: human-readable JSON exportとdeep-equivalent import、v0→v1逐次migrationをテストする。
4. RED: malformed、schema invalid、oversized、entity過多、future version、script-like string、remote URLを含む入力が現シーンとautosave digestを変更せず、URL fetchも起こさないことをテストする。
5. GREEN: `size check → parse → format/version判定 → migrate → validate → normalize → atomic replace` の順でimport pipelineを実装する。文字列はデータとしてのみ保持する。
6. `npm test -- src/persistence` と `npm run typecheck` を実行する。
7. Commit: `feat: add transactional local persistence`

## Task 6: レスポンシブ編集シェル、カタログ、アウトライナー、インスペクター

**Files:**
- Create: `src/app/editor-store.ts`, `src/editor/EditorShell.tsx`
- Create: `src/editor/CatalogPanel.tsx`, `src/editor/Outliner.tsx`, `src/editor/Inspector.tsx`
- Create: `src/editor/RoomInspector.tsx`, `src/editor/EntityInspector.tsx`, `src/editor/Toolbar.tsx`
- Create: `src/editor/*.test.tsx`
- Modify: `src/app/App.tsx`, `src/styles.css`

**Steps:**

1. RED: catalogまたはoutlinerの選択が同じstable entity IDを選び、対応するinspectorを開くcomponent testを書く。
2. RED: room inspectorで畳プリセットとwidth/depth/heightを変更するとroomだけが変わり、はみ出し警告が表示されるテストを書く。
3. RED: monitor inspectorが24/27/32インチとCustomを提供し、preset→direct custom→preset resetでcatalog参照を保持するテストを書く。
4. GREEN: editor transient stateとcommand storeを結線し、catalog metadataからposition、rotation、dimensions、preset、material、portsのfield UIを生成する。
5. RED→GREEN: inherited/preset/overrideの表示とreset操作、lock/visibility/rename/duplicate/delete/group操作、undo/redo、save statusを実装する。
6. RED→GREEN: 1440/1024/390幅で主要操作がDOM上到達可能なcomponent testを追加し、desktop side panelsとmobile drawers/bottom sheetを実装する。
7. `npm test -- src/editor src/app`、`npm run typecheck`、`npm run lint` を実行する。
8. Commit: `feat: build responsive scene editor shell`

## Task 7: 3D編集レンダラーと選択同期

**Files:**
- Create: `src/renderer/SceneCanvas.tsx`, `src/renderer/SceneRoot.tsx`, `src/renderer/RoomShell.tsx`
- Create: `src/renderer/entities/EntityRenderer.tsx`, `src/renderer/entities/GenericBox.tsx`
- Create: `src/renderer/adapters.ts`, `src/renderer/materials.ts`, `src/renderer/quality.ts`
- Create: `src/renderer/FallbackPanel.tsx`, `src/renderer/*.test.tsx`
- Modify: `src/editor/EditorShell.tsx`

**Steps:**

1. RED: mm/degreesのSceneDocumentがrenderer adapterで正しいThree.js位置・寸法・回転になり、逆変換で丸めが安定するテストを書く。
2. GREEN: floor、2面の壁、grid、ambient/key/fill light、perspective camera、orbit/pan/zoom、top view、camera resetを実装する。
3. RED: outliner選択でrendered entityが選択表示され、canvas hitで同じIDがeditor storeへ入り、empty hitで解除される結合テストを書く。
4. GREEN: catalog geometry strategyごとのgeneric procedural geometry、選択outline、locked/hidden/out-of-bounds表示を実装する。
5. RED→GREEN: WebGL unavailableまたはrenderer errorでblank canvasではなく、選択中対象の数値編集を継続できるfallback panelを表示する。
6. `npm test -- src/renderer`、`npm run typecheck`、`npm run build` を実行する。
7. Commit: `feat: render synchronized editable 3d scene`

## Task 8: 3D変形・リサイズと数値入力の双方向同期

**Files:**
- Create: `src/renderer/controls/TransformGizmo.tsx`, `src/renderer/controls/ResizeHandles.tsx`
- Create: `src/renderer/controls/interaction-controller.ts`
- Create: `src/renderer/controls/*.test.ts`
- Create: `e2e/editor-sync.spec.ts`
- Modify: `src/editor/Toolbar.tsx`, `src/editor/EntityInspector.tsx`

**Steps:**

1. RED: pointer drag sequenceがinteraction transactionを開始・更新・commitし、inspector値とserialized sceneをlive更新しつつ履歴1件にまとめるcontroller testを書く。
2. RED: Escape/cancelで値を戻し履歴を増やさず、locked entityを変更せず、translation/rotation/floor snap設定を守るテストを書く。
3. GREEN: move、rotate、capabilityに応じたresize handleを実装する。preset-constrained monitorのdirect resizeはCustom overrideを作る。
4. RED→GREEN: numeric field変更でobject boundsとgizmoが即更新され、gizmo変更でnumeric fieldが即更新されるPlaywrightテストを実装する。
5. RED→GREEN: add/place、duplicate、delete、group/ungroupとselection identityを3Dとoutliner間で検証する。
6. `npm test -- src/renderer/controls` と `npm run test:e2e -- e2e/editor-sync.spec.ts` を実行する。
7. Commit: `feat: synchronize direct and numeric scene editing`

## Task 9: 実用品のパラメトリック形状と高品質プレビュー

**Files:**
- Create: `src/renderer/entities/LDesk.tsx`, `Monitor.tsx`, `MonitorArm.tsx`, `Computer.tsx`
- Create: `src/renderer/entities/Shelf.tsx`, `Printer.tsx`, `Lighting.tsx`, `LivingFurniture.tsx`
- Create: `src/renderer/PreviewEnvironment.tsx`, `src/renderer/ScreenPlaceholder.tsx`
- Create: `src/renderer/entities/*.test.tsx`, `e2e/preview.spec.ts`

**Steps:**

1. RED: L字デスクのmain/return寸法、左右、heightがdeterministic boundsを生成し、stable IDsを変えないgeometry testを書く。
2. GREEN: デスク、アーム、monitor bezel/stand、display light、desktop shelf、printer、storage、PC、生活家具をprocedural geometryで視認可能な形にする。
3. RED: editor/preview切替の前後でcanonical serialized scene digestが完全一致するテストを書く。
4. GREEN: editor profileは軽量material/shadow、preview profileは改善material、tone mapping、antialiasing、soft shadow、局所照明、adaptive DPRを使う。表示画面はローカル生成の静的dashboard placeholderにする。
5. RED→GREEN: Future Workstation templateをeditor/previewの双方で開き、必須アイテムが選択可能で、モード差が視覚的に現れるbrowser testと固定スクリーンショットを追加する。
6. `npm test -- src/renderer/entities`、`npm run test:e2e -- e2e/preview.spec.ts`、`npm run build` を実行する。
7. Commit: `feat: add detailed workstation models and preview mode`

## Task 10: 端子と配線編集

**Files:**
- Create: `src/domain/connections.ts`, `src/domain/connections.test.ts`
- Create: `src/renderer/entities/Cable.tsx`, `src/renderer/entities/PortMarker.tsx`
- Create: `src/editor/CableInspector.tsx`, `src/editor/CableTool.tsx`
- Create: `e2e/cables.spec.ts`

**Steps:**

1. RED: PC、monitor、power stripのstable named portsへcableを接続し、free endpointとmanual waypointsも保持できるdomain testを書く。
2. GREEN: dangling endpointを拒否し、entity移動後もport ID参照を保持するconnection helpersとcommandsを実装する。
3. RED→GREEN: 3D上でportを選んで接続し、waypointを追加・移動・削除できる編集UIを実装する。
4. RED→GREEN: cableが両モードで描画され、autosave/reload/export/importを通過するPlaywrightテストを追加する。
5. UIとREADME内では「配線は概略。電気・長さ・荷重・曲げ半径の検証ではない」と明示する。
6. `npm test -- src/domain/connections.test.ts` と `npm run test:e2e -- e2e/cables.spec.ts` を実行する。
7. Commit: `feat: add illustrative port and cable routing`

## Task 11: 永続化・レスポンシブ・offline・性能のブラウザ受入

**Files:**
- Create: `e2e/first-run.spec.ts`, `e2e/persistence.spec.ts`, `e2e/responsive.spec.ts`
- Create: `e2e/offline.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/performance.spec.ts`
- Create: `src/test/performance-scene.ts`, `src/test/import-fixtures.ts`
- Modify: UI components and styles only where tests expose a failing behavior

**Steps:**

1. RED→GREEN: 4畳プリセット、畳規約表示、既存IDを保つroom resize、はみ出し警告をproduction buildで検証する。
2. RED→GREEN: autosave完了、reload同値、storage failure、export/import deep equivalence、migration、失敗時transactionalityを検証する。
3. RED→GREEN: 1440×900、1024×768、390×844でselection、numeric edit、undo、mode switch、import/exportが到達可能か検証する。
4. RED→GREEN: keyboard-only操作、visible focus、accessible names、labeled numeric alternatives、axe重大違反ゼロを検証する。
5. RED→GREEN: production load後にnon-local requestをabortし、create/edit/preview/autosave/export/import/reloadを完走する。
6. RED→GREEN: 初期テンプレート＋simple instance 100個でselection/numeric editを測定し、基準環境で250ms未満、mode switch後のexport/history/console正常を記録する。閾値測定はテスト環境の変動をログへ残す。
7. `npm run test:e2e`、`npm run typecheck`、`npm run lint`、`npm run build` を実行する。
8. Commit: `test: cover public v1 acceptance workflows`

## Task 12: 公開リポジトリ文書、sample、CI、最終検証

**Files:**
- Create: `README.md`, `LICENSE`
- Create: `docs/architecture.md`, `docs/scene-format.md`, `docs/catalog-extension.md`, `docs/assets.md`
- Create: `public/samples/future-workstation-apartment.json`
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

**Steps:**

1. RED: documentation link checkと、絶対ローカルパス・代表的secret pattern・外部runtime URL・未帰属assetを検出するrepository test/scriptを追加し、必要文書がない状態で失敗を確認する。
2. GREEN: setup、Node版、commands、static deploy、操作、畳規約、単位、scene format、migration、catalog追加、商品URLの将来extension、asset attribution、visual planningの限界を文書化する。
3. `public/samples/future-workstation-apartment.json` を実アプリのexportから生成し、schema validationとround trip testのfixtureとして検証する。
4. GitHub Actionsでclean install、format check、lint、typecheck、unit test、Chromium browser test、build、repository scanを実行する。
5. fresh checkout相当で `npm ci && npm run format:check && npm run lint && npm run typecheck && npm test -- --run && npm run test:e2e && npm run build` を実行し、全出力を保存する。
6. 本番ビルドをブラウザで開き、Future Workstation template、数値/3D同期、preview、autosave、JSON往復、responsive、WebGL fallbackを手動確認し、スクリーンショットを残す。
7. ChatGPT Proループへ実装レポートと検証証跡を渡し、semantic reviewの必須指摘を解消する。
8. Solの最終レビューで仕様適合・コード品質・公開安全性を確認する。
9. Commit: `docs: prepare apartment planner for public release`

## Execution Assignment

- Terra: Tasks 1–5、7–10の実装主体。各タスクを個別commitし、報告ファイルへRED/GREENのコマンドと結果を残す。
- Luna: Task 6のレスポンシブUI仕上げ、およびTask 11のユーザー操作観点のブラウザQAを独立した作業単位として担当する。
- Sol: 計画確定後のarchitecture commitment review、各重要タスクの仕様/品質ゲート、Task 12後のwhole-branch final reviewを担当する。
- Codex controller: task brief、ledger、review package、ChatGPT Proループ、依存関係、統合、最終ローカル検証、GitHub公開操作を管理する。

## Completion Gate

次をすべて満たしたときだけv1完成とする。

- `npm ci` から全test、lint、typecheck、buildが非対話で成功する。
- 19個のPro受入基準へ、test名、artifact、screenshotまたはcommand transcriptを対応付けられる。
- editorとpreviewのcanonical `SceneDocument` digestが一致する。
- 3D direct editとnumeric editの両方向、undo/redo、cancel/coalescingを実ブラウザで確認できる。
- autosaveとJSON import/exportがfailure時にもlast-known-goodを壊さない。
- 外部runtime request、機密情報、絶対パス、再配布不能assetがない。
- ChatGPT Pro semantic reviewとSol final reviewに未解決のload-bearing findingがない。
