# Tasks

Updated: 2026-04-10

現状は、実装よりも **テスターフィードバック待ち** が最優先の段階です。
このファイルは、今やることと、フィードバック後にやることを分けて整理するためのメモです。

## Current Phase

### Waiting

- packaged build をテスターに渡してフィードバックを回収する
- `Preview / Bake AO / Save PNG` の実運用確認を待つ
- 実アバターでの AO 品質確認を待つ

### Goal

- 机上の調整ではなく、実データで次の改善点を確定する

## Do Now

### 1. AO Profile の JSON 化を設計する

目的:

- いま TypeScript に固定しているプロファイル定義を、将来的に差し替えやすくする
- コード変更なしでプロファイル内容を見直しやすくする
- 将来のカスタムプリセット保存へつなげる

決めること:

- bundled JSON にするか
- user override を後から足せる形にするか
- `Auto / Body / Body Deep AO / Clothing / Hair / Face / Accessory` をそのまま JSON に持つか
- `mm` 表示値ではなく内部 `meter` 値で持つか
- schema version を持つか

まだやらないこと:

- SQLite 化
- ユーザー編集 UI
- import / export 機能

### 2. テスターフィードバックの受け皿を固定する

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

### 3. regression test の候補だけ整理する

候補:

- profile shape validation
- settings の unit conversion
- `Preview` と `Bake AO` の設定分岐
- save 可否の状態遷移

## After Tester Feedback

### 4. AO profile の既定値を詰める

見る項目:

- 白すぎないか
- 服や髪の干渉が強すぎないか
- 手のひら、脇、密着服、顔周りで破綻しないか
- `1024` と `2048` internal map の実用差

### 5. Profile と AO Remap の役割分担を整理する

目的:

- profile は geometry / ray 側
- remap は見た目側

として責務を分ける

決めること:

- profile にどこまで濃さを持たせるか
- remap の既定値を profile ごとに持つか
- 保存時に remap を含める現在仕様を維持するか

### 6. JSON profile 実装へ入る

推奨順:

1. bundled JSON
2. TypeScript 側との責務整理
3. 読み込みと validation
4. 必要なら将来 user override

## Later

### 7. release polish

- app icon
- installer polish
- versioning rule
- release note の簡易テンプレート

### 8. custom profile 保存

前提:

- bundled JSON の方針が固まってから

### 9. test automation

- packaged app smoke test
- bake regression fixture

## Current Recommendation

今この瞬間にやることはこれです。

1. テスター反馈待ちを前提に情報の受け皿を整える
2. その並行で `AO Profile JSON` の schema だけ考える
3. 実際の数値調整はテスターフィードバック後に入る
