# 暮らしの3Dプランナー v1レビュー改善: 現時点の検証ステータス

product candidate `88ecbd52cae1166fb68a661e4535348d45232c0a` を対象に記録する。これは完了宣言ではない。

## Provenance境界

- product candidate: `88ecbd52cae1166fb68a661e4535348d45232c0a`。
- verification harness/evidence input の full-tree SHA: `88ecbd52cae1166fb68a661e4535348d45232c0a`。
- evidence spec 自体は `9d3a985` 由来だが、実行対象の full tree SHA は `88ecbd52cae1166fb68a661e4535348d45232c0a`。
- functional CI remote は full-tree `5cd58c4e8e9b742e266dca3094f2607afe38af61`（product code は product candidate `88ecbd52cae1166fb68a661e4535348d45232c0a` と同一、旧status docsを含む）に対する GitHub Actions run `31646612283` が success（verify全成功、deployはfeature branchのためskip）。現在stagedのP2 test/manifest追補は次commitのためこのrunには含まれず、そのremote CIは未実行。
- tracked evidence manifest: [`v1-review-improvements-evidence-manifest.json`](./v1-review-improvements-evidence-manifest.json)。raw/traces/summary 本体は引き続きignoredで、manifestには実行条件・集計値・相対ファイル名・SHA-256 digestのみを記録する。

## Local functional verification

- focused verification: `28/28 PASS`。
- full unit: `36 files / 239 tests`。
- typecheck、lint、format、check:repo、build: `PASS`。
- headed normal E2E: `16/16 PASS`、retryなし、median `71.2 ms`。
- build: `661 modules`、entry `352.03 kB`、`SceneCanvas` `1000.90 kB`。既知の `>500 kB` warningあり。

## Strict headed Windows evidence

`14 tests` 中 `10 PASS / 4 FAIL`、retryなし。

| 対象   | 判定         | 確認結果                                                                                                                                                                                                                                                                                                                          |
| ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-007 | `FAIL`       | resize handler p95 `0.1 ms` / max `8.4 ms`、frame p95 `18.9 ms`、Long Tasksは `>50 ms: 1`、`>100 ms: 1`、max `252 ms`。transform handler p95 `0.1 ms` / max `8.8 ms`、frame p95 `12.5 ms`、Long Tasksは `>50 ms: 2`、`>100 ms: 1`、max `106 ms`。paired frame p95 `25 ms`、Long Tasksは `>50 ms: 2`、`>100 ms: 1`、max `140 ms`。 |
| AC-008 | `FAIL`       | focused selection testはPASS。OrbitもPASS（frame p95 `25 ms`、Long Tasks `0`、canonical writes `0`）。five-commit median `65.1 ms > 50 ms`、cancel witnessの`selectionStable`は`false`、direct autosave scheduleはunavailable。                                                                                                   |
| AC-019 | `UNRESOLVED` | exact 100-entity、frame p95 `25 ms`、Long Tasks `0`、canonical unchanged / zero writesはPASS。deterministic High/Balanced/Safe tier matrixのみ未解決。                                                                                                                                                                            |
| AC-022 | `FAIL`       | errors、page errors、rejections、failed requests、missing assets、shader errorsはすべて `0`。warnings `2`: `THREE.Clock` deprecation と `PCFSoftShadowMap` deprecation。                                                                                                                                                          |

## 未解決事項とGPC

- Linux strict evidenceはWSL `E_ACCESSDENIED`のままUNRESOLVED。Windows headed evidenceやfunctional CIとは別の証拠境界である。
- GPCは `BLOCKED`、`round2`、`REVIEW_REPEATED_BLOCKER`。`final-verify`は未実施で、retry / reset / bypassはない。
- raw / traces / summary はignored local evidenceであり、commit対象外とする。

## Release判定

release判定は `NO / FIX-FIRST` とする。完了宣言やmerge可の判断はしていない。
