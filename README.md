# Avatar AO Baker

VRChat 向けアバター資産のための、`FBX -> AO bake -> PNG save` に特化したデスクトップアプリです。

このプロジェクトは汎用 3D エディタではなく、次の 3 点に絞っています。

1. `FBX` を読み込める
2. 1 メッシュずつ AO を焼ける
3. グレースケール PNG として保存できる

## 配布

Windows 向け配布物は GitHub Releases の `Avatar-AO-Baker-<version>-setup.exe` です。

- 対応 OS: Windows x64
- installer 形式: `NSIS`
- 現在は未署名のため、Windows SmartScreen 警告が出る場合があります

ライセンスは [MIT](./LICENSE) です。

## できること

- `.fbx` のローカル読み込み
- ベイク対象メッシュを 1 つ選択
- influence mesh を個別選択
- `uv` / `uv2` の切り替え
- `Preview` と最終 `Bake AO` の分離
- ray-based AO ベイク
- AO remap
- ベイク結果のプレビュー
- PNG 保存

現在のベイク backend は `ray-based AO` の 1 経路のみです。旧 GPU ベイク経路は削除済みです。

## 想定ワークフロー

1. `FBX` を開く
2. ベイク対象メッシュを選ぶ
3. influence mesh を選ぶ
4. AO profile を選ぶ
5. 必要なら `Preview` で軽量確認する
6. `Bake AO` を実行する
7. `Baked AO Output` を確認する
8. `Save PNG` で保存する

## 現在の実装状態

このリポジトリは、`load -> bake -> save` の実用フローが通る状態です。

- `Electron + Vite + React + Tailwind CSS + three.js`
- Electron の `main / preload / IPC` 分離
- worker ベースの ray bake
- `three-mesh-bvh` を使った BVH ベース遮蔽判定
- 16:9 デスクトップ前提 UI
- 単一インスタンス起動
- Windows installer 生成確認済み

確認済み:

- `pnpm run typecheck`
- `pnpm build`
- `pnpm start`
- `pnpm run dist:win`

## 既知の制約

- 入力は `.fbx` のみ
- `SkinnedMesh` は static pose 前提
- batch bake は未実装
- ray bake 品質は実データで継続調整中
- packed / mirrored / stacked UV は継続検証が必要
- Windows installer は未署名
- 自動テストは未整備

## 技術スタック

- App shell: Electron
- Frontend: React
- Bundler: Vite
- Styling: Tailwind CSS v4
- 3D: three.js
- Language: TypeScript
- Package manager: pnpm

## 開発セットアップ

前提:

- 最近の Node.js LTS
- `pnpm`

インストール:

```bash
pnpm install
```

もし `pnpm install` 時に build scripts が無効化されていて Electron の実行に失敗する場合は、次も確認してください。

```bash
pnpm approve-builds
```

## 開発コマンド

```bash
pnpm dev
```

個別コマンド:

```bash
pnpm run dev:renderer
pnpm run dev:electron:ts
pnpm run dev:electron:app
pnpm run typecheck
pnpm build
pnpm start
pnpm run pack:win
pnpm run dist:win
```

用途:

- `pnpm run typecheck`: renderer / Electron 両方の型チェック
- `pnpm build`: renderer と Electron の本番ビルド
- `pnpm start`: ビルド済みアプリの起動
- `pnpm run pack:win`: Windows 配布前の展開確認
- `pnpm run dist:win`: Windows installer exe の出力

## アーキテクチャ

このプロジェクトは renderer-first です。

責務:

- renderer: UI / FBX 読み込み / メッシュ一覧 / プレビュー / AO ベイク / PNG 生成
- main: アプリ起動 / `BrowserWindow` 生成 / IPC 登録 / open/save ダイアログ
- preload: `window.avatarAo` の narrow bridge

公開 API:

- `window.avatarAo.openFbxFile()`
- `window.avatarAo.savePng(request)`

実装方針の詳細は [AGENTS.md](./AGENTS.md) を参照してください。

## 関連ドキュメント

- [docs/ROADMAP.md](./docs/ROADMAP.md)
- [docs/STATUS.md](./docs/STATUS.md)
- [docs/TESTER_STRESS_TEST.md](./docs/TESTER_STRESS_TEST.md)
