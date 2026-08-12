# 暮らしの3Dプランナー v1レビュー改善 — 現時点のローカル検証ステータス

product baseline `ad7b946`、verification harness/status baseline `d3c1b80`、および各検証結果の対象を区別して記録する。これは完了宣言ではない。

## Provenance境界

- product baseline: `ad7b946`。
- verification harness/status baseline: `d3c1b80`。
- evidence run against product baseline: `ad7b946`。
- functional CI against full tree: `d3c1b80` / GitHub Actions run `31625594080`。

## Functional CI

- Ubuntu functional CI は `16/16 PASS`、retryなし、median `215.2ms`。
- unit は `36 files / 232 tests`、build等は `PASS`。

## ローカル検証

- verification harness/status baseline `d3c1b80` の `e2e/performance.spec.ts` は、131-entity負荷のbenchmarkとroundtripに分割している。`createPerformanceScene(100)` は固定31 entityに100 entityを追加するため総数131であり、100-entity acceptanceの主張ではない。
- `retries=0` で対象 spec を4回連続実行し、各回 `2 PASS`。4回目はSol独立実行で22.9秒、中央値87.3ms。
- 通常E2E全体は `16 PASS`。
- 実行環境は Windows 11 / Node 22.22 / headed Chromium 151。Linux strict evidenceは未取得である。

## Evidence run against product baseline `ad7b946`

13件中 `6 PASS / 7 FAIL`、`flaky 0`。

| 対象   | 判定   | 確認結果                                                                                                                                                                                               |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-007 | `FAIL` | resize max `17.3 > 16`、frame p95 `33.4 > 25`、Long Tasksあり。transformもLong Tasksあり。attributed p95 `49.9 > 25`。pairedは30s timeout。                                                            |
| AC-008 | `FAIL` | stable/commit count は一部PASS。restore `314.4 > 250`、`escape-cancel-preserves-canonical-state` witness失敗、cancel/autosave witness、orbit p95 `33.3 > 25`。                                         |
| AC-019 | `FAIL` | 100-entity evidence fixture / zero writes / runtime はPASS。p95 `50.1 > 25`、Long Tasks `20 > 1`、tier selectorなし。                                                                                  |
| AC-022 | `FAIL` | warning `6`（Three.Clock deprecation `1`、PCFSoftShadowMap deprecation `1`、GPU ReadPixels stall `4`）。console errors、page errors、failed requests、missing assets、shader、unhandled はすべて `0`。 |

## 未解決事項とGPC

- Linux strict evidenceは未取得。Ubuntu functional CIとは別の証拠境界である。
- GPC は `BLOCKED`、`round2`、`REVIEW_REPEATED_BLOCKER`。required は `PROVIDE_EVIDENCE`、`final-verify` は未実施である。
- 同一controllerでの retry / reset / bypass はない。
- `event.delta` へは戻していない。

raw / traces / summary は ignored local evidence として保持し、commit対象外とする。traceは約134.9MBを含む。

## Release判定

merge、deploy、GitHub Pagesの変更はない。`main` mergeは公開につながるため、release判定は `NO / FIX-FIRST` とする。

これは完了宣言ではない。
