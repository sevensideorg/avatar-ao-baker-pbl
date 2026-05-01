# Avatar AO Baker

VRChat / Unity 向けアバター資産のための AO テクスチャ作成ツールです。

`FBX` を読み込み、メッシュを 1 つ選んで、Ambient Occlusion をグレースケール PNG として保存できます。汎用 3D エディタではなく、`FBX -> AO bake -> PNG save` の流れに絞った Windows デスクトップアプリです。

## ダウンロード

Windows 向けインストーラーは GitHub Releases から配布します。

- 配布ファイル: `Avatar-AO-Baker-<version>-setup.exe`
- 対応 OS: Windows x64
- インストーラー形式: NSIS
- ライセンス: [MIT](./LICENSE)

現在のインストーラーは未署名です。初回起動時に Windows SmartScreen の警告が出る場合があります。

## できること

- `.fbx` ファイルのローカル読み込み
- AO を焼く target mesh の選択
- 遮蔽に使う influence mesh の個別選択
- `uv` / `uv2` の切り替え
- 軽量 `Preview` と最終 `Bake AO` の分離
- ベイク中のキャンセル
- `Draft / Standard / High / Ultra` の quality preset
- ray-based AO ベイク
- edge-preserving denoise
- AO remap
- ベイク結果のプレビュー
- PNG 保存

現在のベイク backend は `ray-based AO` のみです。旧 GPU ベイク経路は削除済みです。

## 基本的な使い方

1. `Open FBX` で `.fbx` を開く
2. `Target Mesh` で AO を焼きたいメッシュを選ぶ
3. `Influence Meshes` で遮蔽に使うメッシュを選ぶ
4. 必要に応じて `uv` / `uv2` を選ぶ
5. `AO Profile` と `Quality` を選ぶ
6. `Preview` で軽量確認する
7. 問題なければ `Bake AO` を実行する
8. 必要なら `Cancel Bake` で中断する
9. `Baked AO Output` を確認する
10. 必要なら `AO Remap` で strength / contrast / gamma を調整する
11. `Save PNG` で保存する

`Preview` は確認用の軽量ベイクです。quality preset に関係なく、`32 rays / 128px internal map / 8px padding` で実行されます。

最終的に保存する AO は `Bake AO` の結果です。こちらは選択した quality preset を使います。

## Quality Preset

| Preset     | Rays | 用途                               |
| ---------- | ---: | ---------------------------------- |
| `Draft`    |   32 | 形状確認や短時間の試し焼き         |
| `Standard` |   64 | 通常用途の基準                     |
| `High`     |  128 | ノイズを抑えたい場合               |
| `Ultra`    |  256 | 時間がかかっても品質を優先する場合 |

サンプル数を上げるほどノイズは減りますが、ベイク時間は長くなります。まず `Preview` で範囲を確認し、最終出力だけ `High` 以上にする使い方を推奨します。

## 出力 PNG について

出力される PNG は、Unity で単体の AO / Occlusion texture として扱うためのグレースケール画像です。

- 白: 遮蔽なし
- 黒: 遮蔽あり
- `R / G / B`: 同じ AO 値
- `A`: 不透明
- 出力サイズ: `2048px` または `4096px`

JPEG 出力は現在対応していません。AO はデータテクスチャとして扱うため、非可逆圧縮の JPEG より PNG の方が安全です。JPEG では UV seam 付近のにじみや圧縮ノイズが AO 値として見える可能性があります。

## Unity / VRChat での使い方

Unity に読み込む場合は、Texture Import Settings で次を推奨します。

- Texture Type: `Default`
- sRGB (Color Texture): `Off`
- Alpha Source: `None` または未使用
- Compression: 用途に応じて設定

`sRGB (Color Texture)` は基本的に Off にしてください。AO は色ではなく数値データとして扱うためです。

`uv2` に焼いた場合、Unity 側の shader も同じ UV を参照している必要があります。通常の material が `uv` を読む場合は、`uv` に焼くのが安全です。

URP の channel-packed texture として使う場合、このアプリの出力はそのまま packed map ではありません。URP Lit の packed map では、一般的に `R = Metallic`, `G = Occlusion`, `A = Smoothness` のようにチャンネルごとの用途が決まっています。必要な場合は、この AO PNG を別ツールで `G` チャンネルへ pack してください。

`AO Remap` を使って保存した場合、プレビュー中の strength / contrast / gamma が反映された PNG が保存されます。

## ベイク方式

AO は UV テクスチャとして出力されますが、遮蔽計算自体は world transform 適用後の geometry に対する world-space ray AO です。

ベイク処理の概要:

1. target / influence mesh を world transform 適用済み geometry に変換
2. target mesh を選択 UV 上に rasterize
3. texel ごとの world position / world normal から hemisphere ray を生成
4. influence mesh の BVH に raycast して遮蔽率を計算
5. AO blur / UV padding / upscale を行う
6. PNG として保存する

この AO はライト、カメラ、HDRI、material の色には影響されません。形状同士の遮蔽から計算されます。

## できないこと / 既知の制約

- 入力は `.fbx` のみ
- `SkinnedMesh` は static pose 前提
- batch bake は未実装
- channel-packed texture の直接出力は未実装
- alpha / masked material を考慮した AO は未対応
- mirrored / stacked UV は継続検証が必要
- ray bake 品質は実データで継続調整中
- Windows installer は未署名
- AO regression test はありますが、実アバター資産での検証は継続中

## 技術スタック

- App shell: Electron
- Frontend: React
- Toolchain: Vite+
- Bundler: Vite
- Styling: plain CSS + CSS Modules
- 3D: three.js
- AO acceleration: three-mesh-bvh
- Language: TypeScript
- Package manager: pnpm
- Command entrypoint: `vp`

## 0.1.2 の変更点

`0.1.2` では、公開配布に向けてベイク品質、操作性、TypeScript 境界の安全性を強化しています。

- `Draft / Standard / High / Ultra` の quality preset を追加
- ベイク中の `Cancel Bake` に対応
- edge-preserving denoise と UV padding / upscale を改善
- AO regression test を追加
- `savePng` IPC の runtime validation を追加
- preload の IPC channel 定義を `shared/ipc.ts` に統一
- TypeScript 6 と TypeScript 7 native preview の side-by-side typecheck を追加

TypeScript 7 native preview は開発時の型チェック検証用です。公開 release の build / Electron emit / scripts emit は、安定性のため TypeScript 6 `tsc` を使っています。

## 開発セットアップ

前提:

- 最近の Node.js LTS
- `pnpm`

インストール:

```bash
vp install
```

`vp` はこのプロジェクトの標準コマンド入口です。通常の install / dev / test / build は `pnpm` を直接叩かずに `vp` を使います。

もし install 時に build scripts が無効化されていて Electron の実行に失敗する場合は、package manager 固有の例外として次も確認してください。

```bash
pnpm approve-builds
```

## 開発コマンド

```bash
vp run dev:app
```

個別コマンド:

```bash
vp dev
vp run dev:electron:ts
vp check
vp test
vp build
vp run build:app
vp run typecheck
vp run typecheck:ts6
vp run typecheck:tsgo
vp run typecheck:strict
vp run typecheck:compare
vp run test:ao
vp run start
vp run pack:win
vp run dist:win
```

用途:

- `vp run dev:app`: renderer / Electron watch / Electron app をまとめて起動
- `vp dev`: renderer のみを Vite+ で起動
- `vp check`: format / lint / type-aware validation を一括実行
- `vp test`: Vite+ 経由の Vitest 実行
- `vp build`: renderer の production build
- `vp run build:app`: renderer と Electron の本番ビルド
- `vp run typecheck`: TypeScript 7 native preview (`tsgo`) での型チェック
- `vp run typecheck:ts6`: TypeScript 6 の `tsc` での型チェック
- `vp run typecheck:tsgo`: renderer / Electron / scripts を `tsgo` で型チェック
- `vp run typecheck:strict`: renderer を `tsgo` で未使用 symbol も含めて追加チェック
- `vp run typecheck:compare`: `tsc` と `tsgo` の型チェックを続けて実行
- `vp run test:ao`: synthetic geometry を使った AO regression test
- `vp run start`: ビルド済みアプリの起動
- `vp run pack:win`: Windows 配布前の展開確認
- `vp run dist:win`: Windows installer exe の出力

`extra` ブランチでは TypeScript 7 native preview (`tsgo`) を主 typecheck として試しています。通常の build / Electron emit / scripts emit は、安定性のため TypeScript 6 の `typescript` / `tsc` を維持しています。

TypeScript 7 はこのブランチでは検証用途です。公開 release 用の build pipeline へ全面移行するのではなく、`typecheck:compare` で TypeScript 6 と TypeScript 7 の両方を通し、差分や preview 起因の問題がないかを確認する方針です。

## アーキテクチャ

このプロジェクトは renderer-first です。

責務:

- renderer: UI / FBX 読み込み / メッシュ一覧 / プレビュー / AO ベイク / PNG 生成
- main: アプリ起動 / `BrowserWindow` 生成 / IPC 登録 / open/save ダイアログ
- preload: `window.avatarAo` の narrow bridge

公開 API:

- `window.avatarAo.openFbxFile()`
- `window.avatarAo.savePng(request)`
