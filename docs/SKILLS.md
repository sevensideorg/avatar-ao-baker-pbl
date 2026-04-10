# App Skills

今回の `Avatar AO Baker` 開発で、今後のデスクトップアプリ制作にも再利用しやすい実践知をまとめる。

## 1. 先にスコープを細く固定する

- 最初に `load -> process -> save` の最短フローを固定する
- エディタ化しない
- 周辺機能より本命経路を先に通す

今回でいう本命は:

- `FBX` を開く
- AO を焼く
- `PNG` を保存する

## 2. Electron は薄く保つ

- main process は起動、ウィンドウ、dialog、IPC 登録だけに寄せる
- 重い処理を main に入れない
- preload は narrow bridge のまま保つ
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` を維持する

実装原則:

- UI と処理本体は renderer 側
- desktop 固有機能だけ IPC

## 3. 本番経路は 1 本に絞る

- 実際に使わない backend は早めに消す
- `CPU` と `GPU` を両方残すと、型、文言、検証、レビューが全部二重化する
- 比較実験コードと shipping code を混ぜない

今回の判断:

- 旧 GPU AO は削除
- ray-based CPU bake を shipping path に固定

## 4. 重い処理は最初から worker 前提で組む

- UI thread で長時間処理を回さない
- bake core は worker へ逃がす
- fallback を残す場合は transfer 済み buffer の破損に注意する
- main thread 側に重い後処理を残さない

有効だったこと:

- BVH build
- ray cast
- filtering
- upscale
- padding

を worker 側に寄せること。

## 5. Preview と Final Bake を分ける

- 軽い確認用の `Preview`
- 保存前提の `Bake AO`

を分けると、速度と品質の両立がしやすい。

今回の学び:

- preview を保存不可にすると設計がぶれにくい
- users は「速い確認」と「最終出力」を別物として理解しやすい

## 6. UI はドキュメントではなく作業台として組む

- 16:9 の固定ステージを先に決める
- 全体スクロールより局所スクロール
- 左に設定、右に結果
- 操作ボタンは結果の近くに置く

今回で効いた方針:

- 左は control island
- 右は `Scene Preview` と `Baked AO Output`
- `Preview / Bake AO / Save PNG` は output セクションへ寄せる

## 7. 常設テキストは短くする

- 説明文は削れるだけ削る
- 状態は 1 行でよい
- 長文ヘルプを UI に常駐させない
- 詳細説明は docs に逃がす

判断基準:

- 見た瞬間に分かる文だけ残す
- 読まないと使えない UI にしない

## 8. 3D / 画像ビューはローカル操作に閉じる

- ホイール、ドラッグ、パン、ズームは viewport 内だけで完結させる
- ウィンドウ全体のスクロールやレイアウトに影響させない
- 体感の悪い UI は state 更新より描画経路を見直す

今回で有効だったこと:

- AO preview を `img + CSS transform` から `canvas` 描画へ変更
- drag 中は `requestAnimationFrame` ベースにして追従性を上げる

## 9. three.js は GC 任せにしない

- scene 差し替え時は明示 dispose
- geometry / material / texture / boneTexture を破棄する
- helper も remove だけで終わらせない
- object URL や worker も cleanup する

実務ルール:

- 「見えなくなった」ではなく「dispose した」で考える

## 10. キャッシュは便利だが、保持理由を明確にする

- leak と cache を混同しない
- 何を何単位で再利用するかを明確にする
- 組み合わせごとの巨大 cache より per-mesh cache を優先する
- invalidation 条件を後回しにしすぎない

## 11. 品質改善は backend と post-process を分けて考える

- AO が白い問題はサンプリングだけでなく remap の問題でもある
- backend の正しさと見た目の締まりは別レイヤ
- `Strength / Contrast / Gamma` のような output remap は後段で持つ

考え方:

- 幾何計算の正しさ
- 見た目としての使いやすさ

を分離する。

## 12. release 導線は早めに作る

- `.gitignore`
- `.gitattributes`
- `README`
- internal docs
- packaging

を後回しにしすぎない。

今回で有効だったこと:

- `docs/` へ内部資料を集約
- `electron-builder` で `setup.exe` を出せる状態を早めに作る
- テスター向け手順を md で固定する

## 13. テスター向け成果物は最小にする

- 渡すファイルを絞る
- installer を優先する
- テスト手順は別紙で渡す

今回の形:

- `setup.exe`
- `TESTER_STRESS_TEST.md`

## 14. レビューは「動くか」より「運用で壊れないか」を見る

重点的に見る項目:

- 未接続コードが残っていないか
- dispose 漏れがないか
- fallback が壊れていないか
- UI 文言と実際の挙動が一致しているか
- packaging 後の導線が崩れていないか

## 15. 今後も再利用したい制作ルール

- 本命経路 1 本主義
- thin Electron shell
- worker-first heavy processing
- desktop-first fixed layout
- local interaction only
- docs と release を並行整備
- unused path を残さない

## Short Version

今後のアプリ制作でまず使う判断はこれで十分。

1. 本命フローを 3 手以内に固定する
2. shell は薄く、重い処理は worker へ逃がす
3. shipping path は 1 本に絞る
4. UI は作業台として配置する
5. dispose と packaging は後回しにしない
