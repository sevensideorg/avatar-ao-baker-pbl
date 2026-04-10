# Avatar AO Baker

VRChat 向けアバター資産のための、シンプルな AO ベイク用デスクトップアプリです。

目的は広い 3D ツール化ではなく、次の 3 点に絞っています。

1. FBX を読み込める
2. 1 メッシュずつ AO を焼ける
3. PNG として保存できる

詳細な実装方針は [AGENTS.md](./AGENTS.md) を参照してください。

関連ドキュメント:

- [docs/ROADMAP.md](./docs/ROADMAP.md)
- [docs/STATUS.md](./docs/STATUS.md)
- [docs/TESTER_STRESS_TEST.md](./docs/TESTER_STRESS_TEST.md)

## 現在の実装状態

現時点で入っているのは最小限の開発土台です。

- `Electron + Vite + React + Tailwind CSS + three.js` の構成
- Electron の `main / preload / IPC` 分離
- `.fbx` のファイル選択と読み込み
- シーン内メッシュ一覧の収集
- 選択メッシュの 3D プレビュー
- ベイク対象メッシュと AO へ影響するメッシュの個別選択
- `uv` / `uv2` の選択
- 軽量 `Preview` と最終 `Bake AO` の分離
- AO ベイク結果のプレビュー
- PNG 保存ダイアログ経由の書き出し

AO ベイクは現在 ray-based の 1 経路です。

- `Ray Bake`: UV 空間へ world position / normal を展開し、selected influence meshes に対して半球レイで AO を積算します
- 本番ベイクは CPU worker ベースで、旧 GPU ベイク経路は削除済みです
- `SkinnedMesh` はまだ静的ポーズ前提の扱いです

つまり「ray-based の本命経路は入ったが、実 FBX での品質検証とチューニングはまだ必要」です。

## 技術スタック

- App shell: Electron
- Frontend: React
- Bundler: Vite
- Styling: Tailwind CSS v4
- 3D: three.js
- Language: TypeScript
- Package manager: pnpm

## セットアップ

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

これは次の 3 本を並列起動します。

- Vite 開発サーバー
- Electron 側 TypeScript の watch build
- renderer と Electron 出力を待ってアプリ起動

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

## Windows Exe Release

Windows 向け exe は `electron-builder` で出力します。

```bash
pnpm run dist:win
```

出力先:

- `release/`

現在の packaging 設定:

- target: `nsis`
- arch: `x64`
- artifact: `Avatar-AO-Baker-<version>-setup.exe`

補足:

- 現在はカスタム Windows icon 未設定
- まずはデフォルト icon で installer を作る構成
- 署名設定はまだ未実装

## ディレクトリ構成

```text
.
├─ electron/
│  ├─ ipc/
│  │  ├─ dialog.ts
│  │  └─ file.ts
│  ├─ main.ts
│  └─ preload.ts
├─ shared/
│  └─ ipc.ts
├─ src/
│  ├─ components/
│  │  ├─ ControlPanel.tsx
│  │  ├─ InfluencePanel.tsx
│  │  ├─ PreviewPane.tsx
│  │  └─ TexturePreview.tsx
│  ├─ lib/
│  │  ├─ aoBake.ts
│  │  ├─ collectMeshes.ts
│  │  ├─ disposeScene.ts
│  │  ├─ imageExport.ts
│  │  ├─ loadFbx.ts
│  │  ├─ rayAoBake.ts
│  │  ├─ rayAoCore.ts
│  │  ├─ rayAoWorker.ts
│  │  ├─ recommendBakeSettings.ts
│  │  ├─ recommendInfluenceMeshes.ts
│  │  └─ types.ts
│  ├─ App.tsx
│  ├─ index.css
│  ├─ main.tsx
│  └─ vite-env.d.ts
├─ AGENTS.md
├─ docs/
│  ├─ ROADMAP.md
│  ├─ STATUS.md
│  └─ TESTER_STRESS_TEST.md
├─ index.html
├─ package.json
├─ tsconfig.electron.json
├─ tsconfig.json
└─ vite.config.ts
```

## アーキテクチャ

このプロジェクトは renderer-first です。

### Renderer

[src/App.tsx](./src/App.tsx) と `src/lib/*` が中心です。

責務:

- UI
- FBX 読み込み後の scene 管理
- メッシュ一覧化
- プレビュー表示
- AO ベイク
- PNG データ生成

### Main

[electron/main.ts](./electron/main.ts) は薄く保ちます。

責務:

- アプリ起動
- `BrowserWindow` 生成
- IPC 登録
- 開発時 URL / 本番時 HTML の切り替え

### Preload

[electron/preload.ts](./electron/preload.ts) は narrow bridge だけを公開します。

現在の公開 API:

- `window.avatarAo.openFbxFile()`
- `window.avatarAo.savePng(request)`

### Shared

[shared/ipc.ts](./shared/ipc.ts) に IPC チャンネル名と型を置いています。renderer / preload / main の境界で文字列や payload 形状がズレないようにするためです。

## セキュリティ前提

Electron 側は次の設定を前提にしています。

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

renderer へ raw な Node API は渡していません。新しい機能を追加するときは、preload で task-specific API を増やす形にしてください。`ipcRenderer` をそのまま露出する設計にはしないでください。

## 実装メモ

### FBX ロード

- [src/lib/loadFbx.ts](./src/lib/loadFbx.ts) で `FBXLoader` を使用
- ファイル読み込み自体は [electron/ipc/dialog.ts](./electron/ipc/dialog.ts) 側
- renderer は `ArrayBuffer` を受け取って parse します

### メッシュ選択

- [src/lib/collectMeshes.ts](./src/lib/collectMeshes.ts) で `Mesh` / `SkinnedMesh` を収集
- UV があるメッシュだけをベイク対象候補として使います
- UV が無いメッシュも AO へ影響する occluder としては選択できます
- 選択用 ID は `userData.selectionId` に保持します

### AO ベイク

現在の AO ベイクは [src/lib/aoBake.ts](./src/lib/aoBake.ts) から ray-based 経路を実行します。

Ray path:

1. 選択メッシュを static geometry 化して UV 空間へ rasterize する
2. 各 covered texel に world position / world normal / coverage を持つ UV sample buffer を作る
3. 選択した influence meshes を static geometry 化して `three-mesh-bvh` で BVH を構築する
4. 各 texel から法線基準の半球レイを飛ばして AO を積算する
5. edge-aware blur と UV padding を適用する
6. 必要に応じて 2K / 4K 出力へ upscale し、PNG buffer を生成する

UI では 2 種類の実行があります。

- `Preview`: `128px` internal map の軽量プレビュー。保存不可
- `Bake AO`: 現在の設定で最終 PNG を作る本番ベイク

Ray path は本命経路ですが、品質評価とチューニングはまだ継続前提です。

## 既知の制約

- 入力は `.fbx` のみ
- `SkinnedMesh` は static pose 扱い
- バッチベイクは未実装
- ray bake の品質チューニングは継続中
- `Preview` は軽量表示用で、最終出力ではない
- 自動テストはまだ無い
- Windows exe packaging は入っているが、署名設定はまだ無い

## 推奨の次タスク

優先度順に進めるなら次の順が妥当です。

1. ray bake の品質を実 FBX で評価する
2. `Max Distance` / `Ray Bias` / `Cage Extrusion` / internal map の実用レンジを詰める
3. `Preview` と最終 `Bake AO` の体感差を実データで詰める
4. パッケージングを追加する

## 開発時の注意

- AGENTS の方針どおり、依存は必要最小限に保つ
- `@react-three/fiber` などの抽象化は勝手に入れない
- AO コアは renderer に置く
- main process にレンダリングやベイク本体を寄せない
- preload は narrow bridge のまま保つ
- UI は最小限でよいが、ブラウザ素の見た目にはしない

## 検証状況

この README 作成時点で確認済み:

- `pnpm install`
- `pnpm run typecheck`
- `pnpm build`

未確認:

- GUI の手動起動確認
- 実際の FBX を用いたベイク品質検証
- Electron パッケージング
