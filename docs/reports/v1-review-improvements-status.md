# Apartment 3D Planner v1 レビュー改善・検証ステータス

これは証拠レポートであり、完了宣言またはリリース承認ではありません。

## Provenance

- リポジトリ: `feat/v1-review-improvements`。
- 測定開始時点の immutable baseline HEAD: `06ea4801d7ebdda99b7d8d412969d953c9371a84`（`fix: harden renderer evidence and camera continuity`）。
- 現在の候補: immutable product HEAD `06ea4801` に、未コミットの product callback fix/test（`src/renderer/SceneCanvas.tsx`、`src/renderer/SceneCanvas.test.tsx`）、evidence harness（`e2e/evidence.ts`、`e2e/evidence.test.ts`、`e2e/evidence.spec.ts`）、およびこの status/manifest 更新を加えたもの。commit 前のため full-tree SHA はありません。commit、push、PR、merge、deploy、Pages 変更は行っていません。
- 実行日: `2026-08-14`（Asia/Tokyo）、Windows 11、Node `22.22.0`、Chromium `151.0.7922.34`、viewport `1440x900`。
- raw JSON、trace、summary はローカルの ignored evidence のままで、追跡対象に追加していません。
- immutable product HEAD `06ea4801` に対する GitHub Actions run `31721281066` は success でした。現在の未コミット product+harness/docs candidate では remote CI を実行していません。旧 run `31648056018`（`c53d5d5`）は過去証拠です。

## Fresh evidence と harness 変更

immutable HEAD 上の remote verify は run `31721281066`（success）です。未コミット candidate では、AC-008 direct witness 欠落を red/green の unit test で修正し、既存の bounded `resize-autosave-schedule` phase spans を direct schedule witness として数え raw artifact に保持しました。SceneCanvas の context-menu callback は callback identity を安定化しつつ invocation 時に最新 store snapshot を読むよう red/green integration test 先行で修正しました。

未コミット candidate の full strict headed evidence suite（14 tests、`--retries=0`）は 12 pass / 2 fail でした。FAIL は AC-007 paired transform（zero/50-history window check）と AC-022 browser diagnostics（Three/R3F upstream warning）です。AC-007 の attributed transform targeted run は局所 checks PASS（50 ms 超 1、100 ms 超 0）でしたが、paired/full strict は FAIL を維持しています。paired raw の Long Task は phase と時間的に重なりますが、CDP/page attribution は temporal-overlap-only のため app causality は確定していません。閾値・retry・console suppression は追加していません。

harness 変更後の未コミット candidate で通常検証も fresh に実行しました。Vitest は 37 files / 256 tests が全 pass、typecheck、lint、変更 evidence ファイルを含む format check、`check:repo`、`git diff --check`、build がすべて pass しました。通常 headed Chromium E2E は retries 無しで 16/16 pass です。build には既存の delayed Three.js chunk のサイズ警告（>500 kB）のみありました。

| Criterion | 現在の証拠境界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 結果                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| AC-007    | `ac-007-transform-5s.json` は spec が生成せず summary projection が読む retained historical/pre-callback raw（frame p95 `12.5 ms`、handler p95 `0.1 ms`、50 ms 超 2 件、100 ms 超 1 件）で、current full strict の再生成結果ではありません。current candidate attributed transform targeted raw は局所 PASS（50 ms 超 1、100 ms 超 0）。current full strict paired raw は zero-history `2/>50 ms`（max `69 ms`: active 前 `56 ms`、pointerup 後 `69 ms`）、50-history `2/>50 ms`（max `96 ms`: active 前 `96 ms`、pointerup 後 `58 ms`）で両window FAIL、p95 regression と exactly-one-command は PASS。Long Task の帰属は時間的重なりだけで app causal は確定していません。 | `FAIL`                                                   |
| AC-008    | harness 修正後の headed five-commit targeted rerun: runner 1/1 pass、criterion raw `PASS`、direct schedule phase witness 5 件、debounced physical write 1 件、最終保存文書は canonical と一致。Escape と cleanup 後の witness は分離して記録しています。                                                                                                                                                                                                                                                                                                                                                                                                                     | `PASS`                                                   |
| AC-019    | 過去の3測定は `(10031.9 ms, p95 6.4 ms, delta 8 ms)`、`(10032.2 ms, p95 6.3 ms, delta 4 ms)`、`(10032.2 ms, p95 6.3 ms, delta 4 ms)` ですが、dirty-state別のimmutable rawを保持していないため `THREE_PASS_MEASUREMENTS_MIXED_PROVENANCE` として扱い、repeatabilityは証明しません。current callback candidateはfull strictの最新単一PASS（`11237.3 ms / p95 6.4 ms / Long Task 0`）です。過去の約99.6 s failureは環境変動として保持しています。                                                                                                                                                                                                                               | `PASS_SINGLE_CURRENT_CANDIDATE / repeatability UNPROVEN` |
| AC-022    | headed diagnostics の fresh rerun は通常 warning 1 件で fail: `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` errors、page errors、failed requests、missing assets、shader errors は 0 件。warning は Three `0.185.1` と R3F `9.7.0`（latest stable）の bundled R3F store が `clock: new THREE.Clock` を構築する upstream mismatch です。warning suppression は追加していません。                                                                                                                                                                                                                                                            | `FAIL (upstream dependency/API mismatch)`                |

### AC-019 retained raw

`docs/reports/evidence/raw/ac-019-preview-100-entity.json` は current callback candidateのfull strict最新単一runで固定 harness pathへ上書きされています（SHA-256 `83f8a0d07a9480c1de0a241646e1c7a3a3b2f55ff877b0bb9ae61d8aabceccb6`、3,239,724 bytes、actual elapsed `11237.3 ms`、frame p95 `6.4 ms`、Long Task 0）。先行3測定はdirty-state別rawを保持していないため、歴史的mixed-provenance metricsとしてのみ記録し、current repeatabilityは未証明です。

### AC-008 retained raw

`docs/reports/evidence/raw/ac-008-five-commit-series.json`（SHA-256 `6144636842f6fee0b978c3781db4ea9f22f0b364af80d25ac6a64275973b5782`、1,046,698 bytes）は `autosaveScheduleCount: 5`、5 件の phase-span witness、physical write 1 件、`assessAutosaveEvidence.status: PASS` を記録しています。

## Dependency audit の分類

`npm audit --json` は high advisory 1 件でした: `nanoid@3.3.17`（`GHSA-2v37-7h3g-55p8`、range `<3.3.18`）。ローカルの `npm explain nanoid` と `npm ls nanoid --all` では唯一の経路が `vite@7.3.6 -> postcss@8.5.25 -> nanoid@3.3.17` で、Vite は root の `devDependencies` にあります。runtime dependency graph には含まれません。`npm audit --omit=dev` は safety policy による registry egress block で実行できなかったため、production-only audit の status は主張していません。

## その他の未解決境界

- Linux strict evidence は `Wsl/Service/CreateInstance/E_ACCESSDENIED` のため unresolved です。Windows headed evidence は Linux の代替ではありません。
- AC-007 Long Task の app causal attribution は、diagnostic raw の局所 pass があっても `UNRESOLVED` のままです。推測による hot-path 変更は行っていません。
- GPC は `BLOCKED`（`REVIEW_REPEATED_BLOCKER`）です。retry/reset/bypass は使用していません。`final-verify` は `NOT_RUN` です。
- AC-007 と AC-022 が FAIL のままで Linux evidence も unresolved のため、candidate は release-ready ではありません。

## Release verdict

`FIX-FIRST / MERGE NO`。
