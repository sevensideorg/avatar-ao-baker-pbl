# Avatar AO Baker Roadmap

Updated: 2026-04-10

## Purpose

このドキュメントは、現在の AO ベイク方式の評価と、今後の技術選定方針をまとめたものです。

`STATUS.md` が「何が入っているか」の記録だとすると、この `ROADMAP.md` は「次にどこへ寄せるか」の判断材料です。

## Current Bake Approach

現在の本番ベイクは GPU ではなく、worker 上で動く ray-based AO である。

採用しているのは、target mesh を UV 空間へ rasterize して各 texel に surface point を作り、
selected influence meshes に対して BVH ベースの半球レイを飛ばして遮蔽を積算する方式である。

要点:

- 入力は `target mesh` と `influence meshes`
- target を UV-space へ rasterize して surface position / normal を作る
- influence meshes から BVH を構築する
- 各 texel から法線基準の半球レイを飛ばして可視性を評価する
- 最後に blur / padding / export を適用する

## Strengths Of The Current Approach

- 現在の avatar body AO の要件に対して、旧 GPU 近似より理屈が正しい
- `target mesh` と `influence meshes` を分離でき、アバター用途に合わせて occluder を絞れる
- 髪、服、装飾などの近接遮蔽を狙って調整しやすい
- 最終出力が UV-space のテクスチャなので、アバター制作ワークフローに直接入れやすい
- worker 化されており、UI を止めずに改善しやすい

## Weaknesses Of The Current Approach

- CPU ベースなので internal map と ray 数に応じて時間が伸びやすい
- stacked / mirrored UV では multi-layer 集計にまだ上限がある
- self-occlusion acne、薄いメッシュの前後分離、UV 島境界の扱いは継続改善が必要
- `SkinnedMesh` は静的ポーズ前提で、変形後の正確な bake にはまだ弱い
- bent normal、thickness、batch bake などはまだ未実装

## Product Direction

短期では、現行の ray bake を維持したまま品質と体感速度を上げる。

中期では、app 全体を置き換えるのではなく、`bake backend` だけ別レイヤに切り出して強化する。

そのため、今の基本方針は次の通り。

- UI、FBX 読み込み、プレビュー、保存は現行 stack を維持
- AO ベイクのコアだけを強化対象とする
- 将来的な WebGPU 化は「renderer 全体」ではなく「bake backend 単体」で検討する

## WebGPU Evaluation

### Why WebGPU Is Attractive

WebGPU には compute pipeline があり、AO ベイクのような「大量のサンプルを GPU 側で蓄積する処理」と相性が良い。

理想形では、次の処理をすべて GPU 内に閉じ込められる。

- target texel ごとの AO accumulation
- sample generation
- intersection / visibility evaluation
- blur / denoise
- padding / dilation

これができれば、現在の WebGL ベースより精度・柔軟性・速度の全部で優位に立てる可能性がある。

### Why Full Migration Is Not The First Step

`three.js` の `WebGPURenderer` は有力だが、現在の GPU bake 実装は custom shader 前提であり、
そのまま drop-in で移せる前提ではない。

このため、今すぐ app 全体を WebGPU renderer に寄せるのは得策ではない。

現実的なのは:

- 現行 UI は維持
- preview は当面 three.js のまま維持
- bake 処理だけを raw WebGPU か別 backend に切り出す

## Candidate Libraries And Tools

### `three-mesh-bvh`

用途:

- より正確な CPU 検証用 intersection
- 将来の ray-based AO prototype の土台
- 近接判定、可視性判定、品質比較用の参照実装

評価:

- 現行 three.js 資産との親和性が高い
- 将来的な AO 精度改善の基盤として有力

### `three-gpu-pathtracer`

用途:

- より物理寄りの可視性・遮蔽計算の参考
- AO より広い path tracing 系アプローチの調査材料

評価:

- 直接 texture bake 専用ではない
- そのまま採用というより、設計参考として有用

### `xatlas`

用途:

- AO 専用 UV の再生成
- atlas 整理
- padding 前提の bake への拡張

評価:

- AO の核ではないが、実用ベイカー化には重要
- UV 問題の多いアバター資産に対して効きやすい

### `three.js WebGPURenderer`

用途:

- 将来的な WebGPU renderer 検証

評価:

- stack fit は高い
- ただし現時点では bake backend の直接移植先としては慎重に扱うべき

### Engine Migration Options

候補:

- PlayCanvas
- Babylon.js

評価:

- どちらも WebGPU の観点では検討余地がある
- ただし現状の Electron + three.js 基盤を捨てる理由はまだ弱い
- 短中期の主戦略にはしない

## Recommended Short-Term Work

優先順位:

1. 現行 ray bake の品質を詰める
2. VRChat アバター向けの設定レンジをさらに実測で詰める
3. UV padding / dilation を追加する
4. 近接した髪・服・顔向けに実用プリセットを整える
5. ベイク結果の診断表示を増やし、失敗原因を見やすくする

短期の評価軸:

- 近接した服や髪で破綻しないか
- 顔や関節で不自然な汚れが出ないか
- target と influence の切り分けが直感通りに効くか
- 2K 出力と `1024` internal map で実用速度に乗るか

## Recommended Mid-Term Work

中期の本命は、`bake-only WebGPU prototype` を別 backend として作ること。

理想の構成:

- UI / preview / load / save は現行維持
- bake backend だけ差し替え可能にする
- WebGL backend と WebGPU backend を並行比較できるようにする

prototype の対象:

- texel 単位の AO accumulation
- influence mesh を含む可視性判定
- blur / padding を GPU 内で完結
- 最終 readback は PNG 化時のみ

## Recommended Long-Term Work

- ray-based AO に近い方式への移行検討
- BVH を使ったより正確な visibility evaluation
- cage、thickness、bent normal への拡張
- 複数メッシュの batch bake
- package / distribution の整備

## Success Criteria

次の条件を満たせば、現在の方向性は成功とみなせる。

- VRChat 向けの一般的なアバターで、髪・服・装飾の AO が破綻しにくい
- target / influence の指定だけで大半のユースケースを扱える
- 2K 出力で待てる時間に収まる
- WebGPU を導入する場合でも、UI と周辺機能を壊さず backend だけ進化できる

## Current Recommendation

結論:

- 今すぐ全面 WebGPU 化はしない
- 現行 CPU ray baker を短期で実用品質まで持っていく
- 並行して、raw WebGPU ベースの bake-only prototype を中期課題として切る
- ライブラリ候補は `three-mesh-bvh` と `xatlas` を優先して調べる

## References

- three.js WebGPURenderer docs
- three.js WebGPURenderer manual
- MDN WebGPU API
- MDN GPUComputePipeline
- Blender AO documentation
- VRChat Avatar Scaling
- VRChat Avatar Size Limits
- `three-mesh-bvh`
- `three-gpu-pathtracer`
- `xatlas`
- PlayCanvas compute shader docs
- Babylon.js specifications
