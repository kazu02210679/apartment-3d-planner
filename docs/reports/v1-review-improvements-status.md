# 暮らしの3Dプランナー v1レビュー改善: 現時点の検証ステータス

対象は `feat/v1-review-improvements` のHEAD `c53d5d51c6cd7bd219819cc4d2cd4ba58f73bee3` と、その上の未コミット候補である。HEADのSHAだけでは未コミット候補全体を表さない。この文書は完了宣言ではない。

## Provenance境界

- product / verification baseline: `c53d5d51c6cd7bd219819cc4d2cd4ba58f73bee3`。
- current candidate: 上記HEAD + working treeの未コミット変更。未コミット候補のfull-tree SHAはまだ存在しない。
- execution date: `2026-08-14`（Asia/Tokyo）。
- GitHub Actions: `c53d5d5` に対する run `31648056018` は `success`（verifyは成功、feature branchのためdeployはskip）。現在の未コミット候補に対するremote CIは未実行。
- tracked evidence manifest: [`v1-review-improvements-evidence-manifest.json`](./v1-review-improvements-evidence-manifest.json)。raw/traces/summary本体は引き続きignored local evidenceで、commit対象外である。

## 通常検証

- Vitest: `37 files / 252 tests PASS`。
- typecheck、lint、format、diff check、check:repo、build: `PASS`。
- normal headed E2E: `16/16 PASS`、retries `0`、131-entity samples `[55.1, 53.3, 52.2] ms`、median `53.3 ms`。これは最新候補で再実行した直近値である。
- build: Vite `7.3.6`、`662 modules`、entry `352.01 kB`、`SceneCanvas` `1002.75 kB`。Three.js遅延チャンク由来の `>500 kB` warningのみで、既知の非ブロッカーとして記録する。

## Strict headed Windows evidence

今回の更新ではstrict suite全体を再実行していない。以下のAC-019だけが最新のtargeted headed runであり、過去のfull/older raw結果とは別の証拠境界で記録する。

| 対象   | 判定                                     | 確認結果                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-007 | `FAIL`（旧raw）                          | 旧transform rawはframe p95 `33.4 ms`（閾値 `25 ms`）、handler p95 `0.1 ms`、最大 `13.4 ms`、Long Task `>50 ms: 1`、`>100 ms: 0`。CDPの`preWindowLongTasks` ReferenceErrorとpaired transform timeoutは後続修正で解消したが、旧性能FAILは維持する。今回このACを再実行していない。                                                                                      |
| AC-008 | `TARGETED PASS / RAW UNRESOLVED`         | targeted runner acceptanceとcriterion statusを混同しない。afterEscape/afterCleanupを分離し、inert release後にcleanupしてからexportを待つ限定strict five-commit testはrunner上PASSだが、保持rawは直接autosave schedule witness不足のため`UNRESOLVED`。Orbit rawも`UNRESOLVED`。                                                                                       |
| AC-019 | `TARGETED PASS / REPEATABILITY UNPROVEN` | targeted headed `1/1 PASS`、outer `36.1 s`、raw status `PASS`。actual elapsed `10032.3 ms`（allowed `10000..20000 ms`）、baseline/orbit helper elapsedは各 `10012 ms`、delta `0 ms`、frame p95 `6.3 ms`、Long Tasks `>50 ms: 0`、`>100 ms: 0`。camera state/remount、tier boundaries、settling、orbit changed、canonical export unchanged、zero writesはすべてPASS。 |
| AC-022 | `FAIL`（旧raw）                          | 旧rawのconsole warningsは `THREE.Clock: 1` と `GPU ReadPixels: 4`。errors `0`、page errors `0`、missing assets `0`。今回このACを再実行していない。                                                                                                                                                                                                                   |

### AC-019 targeted raw

- path: `docs/reports/evidence/raw/ac-019-preview-100-entity.json`
- size: `3176843` bytes
- SHA-256: `CFAAE79734E097DB364F92F0068D7B261E899D0B292EF6A84017C1FD31200446`
- previous same-harness run: `99.56 s`、frame p95 `66.5 ms`、Long Tasks `356`。
- 判定: 最新の単一runはPASSだが、同一harnessの結果変動が大きく、反復安定性は未証明。閾値緩和や旧FAILの上書きによるrelease判定は行わない。

### Harness follow-up

- AC-008 targeted strict test: runner acceptance `PASS` / artifact criterion `RAW UNRESOLVED`。
- CDP `preWindowLongTasks` ReferenceError: `RESOLVED`。
- paired transform timeout: `RESOLVED`。性能閾値FAILは受容したまま。
- AC-019の最新targeted runだけを記録した。strict suite全体を再実行したとは扱わない。
- raw / tracesはignored local evidenceであり、commit対象外である。

## 未解決事項とGPC

- AC-007とAC-022は旧rawのFAILを維持し、今回再実行していない。
- AC-008は `TARGETED PASS / RAW UNRESOLVED` を維持する。
- AC-019は最新単一runがPASSだが、同一harnessの反復安定性が未証明である。
- Linux strict evidenceはWSLの `Wsl/Service/CreateInstance/E_ACCESSDENIED` によりUNRESOLVED。Windows headed evidenceやfunctional CIをLinux証拠の代替にはしない。
- GPCは `BLOCKED`（`REVIEW_REPEATED_BLOCKER`）。`final-verify`は `NOT_RUN` で、retry / reset / bypassは行っていない。

## Release判定

release判定は `FIX-FIRST / MERGE NO` とする。現時点でcommit、push、deployは行っていない。
