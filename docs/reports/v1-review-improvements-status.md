# 暮らしの3Dプランナー v1改善 — staging status

基準コミット `9e45ab120821ca2256c8800e235735412a0fd6a9` からのローカル改善を、`feat/v1-review-improvements` としてstagingするための自己完結した状態報告です。これは公開・デプロイ可否の宣言ではありません。

## 判定

| 項目 | 判定 | 根拠・残余 |
| --- | --- | --- |
| canonical `SceneDocument` と数値入力・3D操作の双方向同期 | PASS | editor/store、command、rendererのunit/integration testsと既存E2E証拠 |
| Undo/Redo、Local Storage自動保存、旧スキーマ移行、編集ガード | PASS | 既存テスト群と保存・履歴の検証 |
| 配置solver、支持面、範囲、clearance、occupancy、locked/hidden | PASS | `src/domain/placement.test.ts` とcatalog/command tests |
| pointermove hot path | PASS | transient renderer controllerで更新し、scene clone/normalize/inspection、React publish、history、autosaveを毎回実行しない構成 |
| AC-007 transform/resize性能 | FAIL | canonical測定でLong Taskが閾値超過。handler p95とcanonical commit回数は閾値内 |
| AC-007の原因分類 | UNRESOLVED | fresh 1-updateでも初回Long Taskを再現し、initial/lazy setupを支持するが、React/R3F/browser内部の因果は未確定 |
| AC-008 preview/orbit性能・復帰 | UNRESOLVED | 一部証拠あり。strict matrix witnessと全条件の完了分類が未取得 |
| AC-019 100 entity preview orbit | UNRESOLVED | raw traceを含む環境依存証拠はローカル保持。release commitには含めない |
| AC-022 Linux/runtime console/error/missing asset | UNRESOLVED | Linux実行は環境権限問題が残り、完全な分類は未完了 |
| GPC Pro final-verify | UNRESOLVED | loopは`REVIEW_REPEATED_BLOCKER`でBLOCKED。停止状態を回避・reset・再送していない |

## 検証境界

このstagingでは、ブラウザE2Eの再実行は行わない。直近の記録済みheaded Chromium結果は15/15 PASS、full Vitestは36 files / 230 tests PASS、typecheck/lint/format/repo-check/buildもPASSだった。release-stagingではこれらをローカル検証コマンドで再確認する。Three.js遅延チャンクの500kB超警告は既知の非ブロッカーとして残る。

`event.delta` はauthoritative resize経路に使用しない。canonical raw JSONと`verification-summary.json`は変更せず、今回のcommit対象にも含めない。

## ローカル保持・commit除外

次の環境依存または診断専用artifactは、削除せずローカルに保持するがcommitしない。

- `docs/reports/evidence/traces/`（CDP trace、attributionを含む）
- `docs/reports/evidence/raw/`（canonical raw 9件）
- `docs/reports/evidence/diagnostics/`（AC-007追加診断4件。測定結果は生成済みだが因果判定はUNRESOLVED）
- `docs/reports/evidence/verification-summary.json`（除外artifactへの参照を含むため単独のrelease evidenceとしない）

`.git/info/exclude` に上記3ディレクトリのexact patternを追加している。Sol Advisor role filesはユーザー指定の管理ファイルとしてproduct変更と分離し、秘密情報や認証値を含めない。

## 公開制約

このstagingではcommitまでを行う。push、PR、merge、deploy、GitHub Pages設定変更は行わない。Linux証拠とGPC final-verifyが未完了のため、公開可否は別途判断する。
