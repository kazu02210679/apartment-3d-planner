# 暮らしの3Dプランナー v1レビュー改善 — 現時点のローカル検証ステータス

remote branch HEAD `ad7b946` と、その時点のローカル検証状況を記録する。これは完了宣言ではない。

## リモート検証

- GitHub Actions run `31620130887` は `success`。
- 旧 performance test は2回 timeout した後、3回目に成功した。記録上は `1 flaky / 14 passed`。
- unit は `36 files / 232 tests`、build等は `PASS`。

## ローカル検証

- 未コミットの `e2e/performance.spec.ts` 変更では、performance spec を benchmark と roundtrip に分割している。
- `retries=0` で対象 spec を4回連続実行し、各回 `2 PASS`。4回目はSol独立実行で22.9秒、中央値87.3ms。
- 通常E2E全体は `16 PASS`。
- 実行環境は Windows 11 / Node 22.22 / headed Chromium 151 のみ。これはLinuxの証拠ではなく、GitHub Linux CI は未確認である。

## `ad7b946` evidence run

13件中 `6 PASS / 7 FAIL`、`flaky 0`。

| 対象   | 判定   | 確認結果                                                                                                                                                                                               |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-007 | `FAIL` | resize max `17.3 > 16`、frame p95 `33.4 > 25`、Long Tasksあり。transformもLong Tasksあり。attributed p95 `49.9 > 25`。pairedは30s timeout。                                                            |
| AC-008 | `FAIL` | stable/commit count は一部PASS。restore `314.4 > 250`、`escape-cancel-preserves-canonical-state` witness失敗、cancel/autosave witness、orbit p95 `33.3 > 25`。                                         |
| AC-019 | `FAIL` | 100 entities / zero writes / runtime はPASS。p95 `50.1 > 25`、Long Tasks `20 > 1`、tier selectorなし。                                                                                                 |
| AC-022 | `FAIL` | warning `6`（Three.Clock deprecation `1`、PCFSoftShadowMap deprecation `1`、GPU ReadPixels stall `4`）。console errors、page errors、failed requests、missing assets、shader、unhandled はすべて `0`。 |

## 未解決事項とGPC

- WSL は `E_ACCESSDENIED` で、Linux検証は `UNRESOLVED`。
- GPC は `BLOCKED`、`round2`、`REVIEW_REPEATED_BLOCKER`。required は `PROVIDE_EVIDENCE`、`final-verify` は未実施である。
- 同一controllerでの retry / reset / bypass はない。
- `event.delta` へは戻していない。

raw / traces / summary は ignored local evidence として保持し、commit対象外とする。traceは約134.9MBを含む。

## Release判定

merge、deploy、GitHub Pagesの変更はない。`main` mergeは公開につながるため、release判定は `NO / FIX-FIRST` とする。

これは完了宣言ではない。
