# Avatar AO Baker Status

Updated: 2026-04-10

## Summary

このリポジトリは、`FBX` 入力専用の `Avatar AO Baker` として、`load -> bake -> save` の実用フローが通る状態まで進んでいる。
現在のベイク backend は `ray-based AO` の 1 経路のみで、旧 GPU ベイク経路は削除済み。

UI は 16:9 デスクトップ前提で再設計済み。
左列は設定と influence 管理のスクロール島、右列は `Scene Preview` と `Baked AO Output` の固定ステージ構成。

release 向けの整理も進み、Windows 用 installer exe の生成と、テスターへ渡す packaged build の導線まで入っている。

## Implemented

- Electron shell の初期構成
- `main / preload / IPC` 分離
- ネイティブダイアログ経由の `.fbx` 読み込み
- ネイティブダイアログ経由の `.png` 保存
- preload bridge 不在時の browser fallback
- FBX 内メッシュ収集
- ベイク対象メッシュ選択
- influence mesh 選択
- `uv / uv2` 選択
- ray-based AO ベイク
- `three-mesh-bvh` を使った BVH ベース遮蔽判定
- worker 実行による ray bake オフロード
- `Preview` と最終 `Bake AO` の分離
- AO プレビュー
- 3D プレビュー
- 未選択 influence mesh の半透明表示
- AO profile 推奨値
- 近接 influence mesh の自動選択
- `Body Deep AO` profile
- UV padding
- AO プレビューのローカル zoom / pan
- 3D プレビューのローカル orbit / pan / zoom
- 開発者向け `README.md`
- 方針整理用 `ROADMAP.md`
- `docs/` への内部ドキュメント整理
- `.gitignore` / `.gitattributes` の追加
- `electron-builder` による Windows exe packaging
- テスター向け packaged build 手順

## Current Product Decisions

- ベイク backend は `ray-based AO` のみ
- 出力サイズは `2048 x 2048` / `4096 x 4096`
- 内部 sample map は `128 / 1024 / 2048`
- レイ数は `64` 固定
- `SkinnedMesh` は現状 static pose 前提
- ベイク対象メッシュと occluder を分離して選択可能
- influence に未チェックのメッシュはプレビュー上で半透明表示
- `Auto / Body / Body Deep AO / Clothing / Hair / Face / Accessory` の profile を選択可能
- `Backface Hits` と `Cage Extrusion` は UI から調整可能
- 数値 UI は `mm` 表示ベース
- ページ全体スクロールは使わず、左列のみスクロール
- Windows 配布 target は `nsis x64`
- テスターへは `setup.exe` を優先して渡す

## Current Bake Flow

1. FBX を開く
2. ベイク対象メッシュを選ぶ
3. influence mesh を選ぶ
4. AO profile を選ぶ
5. `Export Size / Internal Map / Max Distance / Padding` を調整する
6. 必要なら `UV / Backface / Ray Bias / Cage` を調整する
7. 必要なら `Preview` で軽量確認する
8. `Bake AO` を実行する
9. `Baked AO Output` で確認する
10. `Save PNG` で保存する

## Major Backend Work Completed

### Ray AO Core

- ray-based AO backend を実装
- UV sample buffer + BVH + hemisphere ray cast 構成へ移行
- `three-mesh-bvh` を導入
- edge-aware blur を追加
- output upscale を追加
- UV padding を追加
- `cage extrusion` を追加
- `backface hit policy` を追加

### Performance / Robustness

- heavy bake core を worker へオフロード
- worker failure 時の fallback request 破損を修正
- per-mesh geometry cache へ整理
- 再ベイク時の geometry cache 再利用を追加
- UV overlap に対して multi-layer AO 集計を追加
- blur guidance を dominant layer 依存から多層集計へ修正

### Quality / Recommendation

- VRChat アバター向け推奨値を導入
- `Body` と `Body Deep AO` を分離
- 近接メッシュを優先する influence 推奨を導入
- `Max Distance / Ray Bias / Cage` を人体スケール向けに調整

## Major UI Work Completed

### Layout

- 16:9 デスクトップ前提で UI を再配置
- 左列を `Control + Influence` の設定島へ整理
- 右列を `Scene Preview + Baked AO Output` の固定ステージへ整理
- `Bake AO / Save PNG` を `Baked AO Output` セクションへ移動
- 左側の入力とボタン密度を一段コンパクト化

### Interaction

- AO プレビューは `wheel zoom / drag pan / double-click reset`
- 3D プレビューは `middle drag rotate / left drag pan / wheel zoom`
- いずれもメインウィンドウ全体には影響しないローカル操作

## Release / Distribution Work Completed

- ルート構成を GitHub 向けに整理
- 内部向け md を `docs/` 配下へ移動
- `electron-builder` を導入
- `pnpm run pack:win` を追加
- `pnpm run dist:win` を追加
- Windows installer exe を生成確認
- `release/Avatar-AO-Baker-0.1.0-setup.exe` の出力を確認
- テスター向けに `setup.exe` と `docs/TESTER_STRESS_TEST.md` を渡す運用を整理

## Current Tester Package

優先して渡すもの:

- `release/Avatar-AO-Baker-0.1.0-setup.exe`
- `docs/TESTER_STRESS_TEST.md`

代替:

- `release/win-unpacked/` 一式
- `docs/TESTER_STRESS_TEST.md`

注意:

- `win-unpacked/Avatar AO Baker.exe` 単体だけを渡してはいけない

## Important Files

- `electron/main.ts`
- `electron/preload.ts`
- `src/App.tsx`
- `src/components/ControlPanel.tsx`
- `src/components/InfluencePanel.tsx`
- `src/components/PreviewPane.tsx`
- `src/components/TexturePreview.tsx`
- `src/lib/aoBake.ts`
- `src/lib/rayAoBake.ts`
- `src/lib/rayAoCore.ts`
- `src/lib/rayAoWorker.ts`
- `src/lib/recommendBakeSettings.ts`
- `src/lib/recommendInfluenceMeshes.ts`

## Current Limitations

- 入力は `.fbx` のみ
- `SkinnedMesh` は static pose 前提
- ray bake 品質はまだ実データ評価が必要
- packed / mirrored / stacked UV は改善済みだが、実運用で継続確認が必要
- 4K export は高精細だが、`1024 / 2048` internal map の負荷が高い
- batch bake は未実装
- Windows installer は出せるが、カスタム icon は未設定
- Windows installer は出せるが、コード署名は未実装
- 自動テストは未整備

## Verified

- `pnpm run typecheck`
- `pnpm build`
- `pnpm start`
- `pnpm run dist:win`

## Recommended Next Tasks

1. 実アバターで `Body` と `Body Deep AO` の品質評価を進める
2. `Max Distance / Ray Bias / Cage Extrusion` の既定値をさらに詰める
3. `Preview` と `Bake AO` の既定 internal map を実データでさらに詰める
4. テスターから packaged build の初回フィードバックを回収する
5. 最低限の bake regression test を入れる
