# Apartment 3D Planner v1 レビュー改善・検証ステータス

これは証拠レポートであり、完了宣言またはリリース承認ではありません。

## Provenance

- リポジトリ: `feat/v1-review-improvements`。
- 測定開始時点の immutable baseline HEAD: `06ea4801d7ebdda99b7d8d412969d953c9371a84`（`fix: harden renderer evidence and camera continuity`）。
- 現在の候補: product/harness 10 files と reports 2 files を含む product/evidence commit `c34bd30` を作成済みです。現在の working tree はこのcommitに対する docs-only provenance follow-up です。今回候補の remote CI は未実行で、push はまだ行っていません。既存 Draft PR #3 は維持し、merge、deploy、Pages 変更は行っていません。
- 実行日: `2026-08-14`（Asia/Tokyo）、Windows 11、Node `22.22.0`、Chromium `151.0.7922.34`、viewport `1440x900`。
- raw JSON、trace、summary はローカルの ignored evidence のままで、追跡対象に追加していません。
- immutable product HEAD `06ea4801` に対する GitHub Actions run `31721281066` は success でした。今回の product/evidence commit `c34bd30` と docs-only follow-up では remote CIを実行していません。旧 run `31648056018`（`c53d5d5`）は過去証拠です。

## Fresh evidence と harness 変更

immutable HEAD 上の remote verify は run `31721281066`（success）です。product/evidence commit `c34bd30` では、以下の5件を working analogue と Three の公式実装比較、RED/GREEN で検証しました。

- move/rotate は transform-only interaction command に分離し、preset monitor と fixed monitor arm の catalog/geometry semantics、history/autosave 1件を保持。
- resize は transient `Object3D.scale` を commit 前に初期 scale へ戻し、canonical dimensions と子階層の二重適用を防止。実 THREE Group/child と headed AC-008 の root scale witness（5回すべて `[1,1,1]`）で確認。
- cancel は Euler の accessor setter を使い、実 THREE Object3D の Euler/quaternion/matrix を復元。
- domain rotation math は Three `Matrix4.makeRotationFromEuler` の XYZ 規約へ一致させ、mixed/nested と near-gimbal threshold の golden test を追加。
- LDesk support surfaces は renderer と共有する resolved geometry から導出し、default/left/right/custom bounds を renderer geometry tests と placement golden で確認。

旧 AC-008 direct witness 修正（bounded `resize-autosave-schedule` phase spans の direct schedule witness 化）と SceneCanvas callback identity fix は前段 candidate で既に完了しており、今回候補にも保持されています。

product/evidence commit `c34bd30` の full strict headed evidence suite（14 tests、`--retries=0`）は 12 pass / 2 fail でした。FAIL は AC-007 paired transform（zero-history window）と AC-022 browser diagnostics（Three/R3F upstream warning）です。AC-007 attributed transform raw は局所 PASS（frame p95 `6.4 ms`、50 ms 超 1、100 ms 超 0）ですが、paired は zero-history `2/>50 ms`（max `62 ms`: active 前 `51 ms`、pointerup 後 `62 ms`）、50-history `1/>50 ms`（max `68 ms`: pointerup 後）で overall FAIL です。50-history p95 regression と各 window exactly-one-command は PASS。CDP/page attribution は temporal-overlap-only のため app causality は確定していません。閾値・retry・console suppression は追加していません。

product/evidence commit `c34bd30` で通常検証も fresh に実行しました。Vitest は 37 files / 266 tests が全 pass、typecheck、lint、format:check、`check:repo`、`git diff --check`、build がすべて pass しました。通常 headed Chromium E2E は retries 無しで 16/16 pass です。strict headed rerun も retries 無しで 14 tests 中 12 pass / 2 fail でした。build には既存の delayed Three.js chunk のサイズ警告（>500 kB）のみありました。最後に追加した commit-rejection resize regression test も 14/14 pass です。

| Criterion | 現在の証拠境界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 結果                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| AC-007    | `ac-007-transform-5s.json` は spec が生成せず summary projection が読む retained historical/pre-callback raw（frame p95 `12.5 ms`、handler p95 `0.1 ms`、50 ms 超 2 件、100 ms 超 1 件）で、c34bd30 full strict の再生成結果ではありません。c34bd30 attributed raw は局所 PASS（frame p95 `6.4 ms`、50 ms 超 1、100 ms 超 0）。c34bd30 full strict paired raw は zero-history `2/>50 ms`（max `62 ms`: active 前 `51 ms`、pointerup 後 `62 ms`）、50-history `1/>50 ms`（max `68 ms`: pointerup 後）で zero-history FAIL、overall FAIL。p95 regression と exactly-one-command は PASS。Long Task の帰属は時間的重なりだけで app causal は確定していません。 | `FAIL`                                                   |
| AC-008    | harness 修正後の headed five-commit targeted rerun: runner 1/1 pass、criterion raw `PASS`、direct schedule phase witness 5 件、debounced physical write 4 件、最終保存文書は canonical と一致。Escape と cleanup 後の witness は分離して記録しています。                                                                                                                                                                                                                                                                                                                                                                                                    | `PASS`                                                   |
| AC-019    | 過去の3測定は `(10031.9 ms, p95 6.4 ms, delta 8 ms)`、`(10032.2 ms, p95 6.3 ms, delta 4 ms)`、`(10032.2 ms, p95 6.3 ms, delta 4 ms)` ですが、dirty-state別のimmutable rawを保持していないため `THREE_PASS_MEASUREMENTS_MIXED_PROVENANCE` として扱い、repeatabilityは証明しません。product/evidence commit `c34bd30` は full strict の最新単一 PASS（`11425 ms / p95 12.5 ms / Long Task 0`）です。過去の約99.6 s failureは環境変動として保持しています。current repeatability は `UNPROVEN_SINGLE_CURRENT_CANDIDATE_PASS` です。                                                                                                                            | `PASS_SINGLE_CURRENT_CANDIDATE / repeatability UNPROVEN` |
| AC-022    | headed diagnostics の fresh rerun は通常 warning 1 件で fail: `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` errors、page errors、failed requests、missing assets、shader errors は 0 件。warning は Three `0.185.1` と R3F `9.7.0`（latest stable）の bundled R3F store が `clock: new THREE.Clock` を構築する upstream mismatch です。warning suppression は追加していません。                                                                                                                                                                                                                                           | `FAIL (upstream dependency/API mismatch)`                |

### AC-019 retained raw

`docs/reports/evidence/raw/ac-019-preview-100-entity.json` は product/evidence commit `c34bd30` content の full strict 最新単一 run で固定 harness path へ上書きされています（SHA-256 `42b8ff97189da2a246341b15cc855ce6a29ec33aba1600fb336803a03816390f`、3,197,768 bytes、actual elapsed `11425 ms`、frame p95 `12.5 ms`、Long Task 0）。先行3測定は dirty-state 別 raw を保持していないため、歴史的 mixed-provenance metrics としてのみ記録し、current repeatability は未証明です。

### AC-008 retained raw

`docs/reports/evidence/raw/ac-008-five-commit-series.json`（SHA-256 `41f9ad553c954e234fe2d3fa5d04e4632568fa507e73fef68a9cf3ec5478f82c6`、1,026,129 bytes）は `autosaveScheduleCount: 5`、5 件の phase-span witness、各 committed renderer root scale `[1,1,1]`、physical writes 4 件、`assessAutosaveEvidence.status: PASS` を記録しています。

## Dependency audit の分類

`npm audit --json` は high advisory 1 件でした: `nanoid@3.3.17`（`GHSA-2v37-7h3g-55p8`、range `<3.3.18`）。ローカルの `npm explain nanoid` と `npm ls nanoid --all` では唯一の経路が `vite@7.3.6 -> postcss@8.5.25 -> nanoid@3.3.17` で、Vite は root の `devDependencies` にあります。runtime dependency graph には含まれません。`npm audit --omit=dev` は safety policy による registry egress block で実行できなかったため、production-only audit の status は主張していません。

## その他の未解決境界

- Linux strict evidence は `Wsl/Service/CreateInstance/E_ACCESSDENIED` のため unresolved です。Windows headed evidence は Linux の代替ではありません。
- AC-007 Long Task の app causal attribution は、diagnostic raw の局所 pass があっても `UNRESOLVED` のままです。推測による hot-path 変更は行っていません。
- GPC は `BLOCKED`（`REVIEW_REPEATED_BLOCKER`）です。retry/reset/bypass は使用していません。`final-verify` は `NOT_RUN` です。
- AC-007 と AC-022 が FAIL のままで Linux evidence も unresolved のため、candidate は release-ready ではありません。

## Release verdict

`FIX-FIRST / MERGE NO`。
