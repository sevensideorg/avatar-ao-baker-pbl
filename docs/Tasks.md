# Tasks

Updated: 2026-04-12

このファイルは、次に着手する作業を優先順で整理するための内部メモです。
現在は `Public 公開に向けた整理` が最優先で、その次に `テスター反馈待ちの実装整理` が続きます。

## Current Priority

### 1. Public 公開前のファイル整理

目的:

- 公開 repo に内部運用文書を残しすぎない
- README とソースだけで外部に伝わる状態にする

消す候補:

- `AGENTS.md`
- `docs/README.md`
- `docs/STATUS.md`
- `docs/SKILLS.md`
- `docs/TESTER_STRESS_TEST.md`

判断保留:

- `docs/ROADMAP.md`

決めること:

- `ROADMAP.md` を公開 repo に残すか
- README から内部 docs へのリンクをどこまで減らすか

### 2. Public 化チェックリストを作る

目的:

- repo を `Public` に切り替える前の抜け漏れを防ぐ

最低限入れる項目:

- 公開不要ファイルを Git 追跡から外す
- README の公開向け表現を最終確認する
- Release asset が `setup.exe` のみで足りることを確認する
- 未署名 installer の注意を README / Release に残す
- ライセンス表記が `Just Alternative` で揃っていることを確認する

### 3. Public 化用コミットを分離する

目的:

- 「公開整理」の変更だけを 1 コミットで追えるようにする

含める変更:

- 内部 docs の削除
- README リンク整理
- 必要なら `docs/ROADMAP.md` の扱い整理

## Parallel Work

### 4. テスター反馈の受け皿を固定する

最低限ほしい情報:

- 使用した FBX
- 選んだ target mesh
- 選んだ occluders
- AO profile
- export size
- internal map
- remap 値
- 問題箇所のスクリーンショット
- 再現手順

### 5. AO Profile JSON 化の schema だけ先に詰める

目的:

- 実データ反馈が来る前に、プロファイル定義の持ち方だけ整理する

決めること:

- bundled JSON にするか
- schema version を持つか
- `meter` 値で保持するか
- 将来 user override を入れられる形にするか

まだやらないこと:

- ユーザー編集 UI
- import / export
- custom profile 保存

## After Public Prep

### 6. 実データ反馈ベースで profile を詰める

見る項目:

- 白すぎないか
- 服や髪の干渉が強すぎないか
- 顔、脇、手のひら、密着服で破綻しないか
- `1024` と `2048` internal map の体感差

### 7. Profile と AO Remap の責務を整理する

考え方:

- profile は geometry / ray 側
- remap は見た目側

決めること:

- profile に濃さをどこまで持たせるか
- remap の既定値を profile ごとに持つか
- 保存時に remap を含める今の仕様を維持するか

### 8. 最低限の regression test 候補を整理する

候補:

- profile shape validation
- settings の unit conversion
- `Preview` と `Bake AO` の設定分岐
- save 可否の状態遷移

## Current Recommendation

今すぐやる順番はこれです。

1. Public 化前に消すファイルを確定する
2. 公開整理コミットを作る
3. repo を `Public` に切り替える
4. その後にテスター反馈待ちの整理と `AO Profile JSON` 設計へ戻る
