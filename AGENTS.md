# AGENTS.md

## Project

**Avatar AO Baker**

Build and maintain a desktop application for VRChat users that focuses only on:

- loading an `FBX`
- selecting one bake target mesh
- baking Ambient Occlusion into UV space
- previewing the baked AO
- saving the result as a PNG

This is **not** a general-purpose 3D editor, Unity toolchain wrapper, or DCC replacement.

The three most important outcomes are:

1. It can load.
2. It can bake.
3. It can save.

Prefer a narrow, practical, stable implementation over feature breadth.

---

## Product Intent

This app is for VRChat avatar workflows:

- body AO
- clothing AO
- hair / accessory occlusion
- manual export to Unity or another downstream tool

The app does **not** need to write textures back into the FBX.
It only needs to produce a usable grayscale AO texture.

---

## Tech Stack

### App shell
- `Electron`

### Frontend
- package manager: `pnpm`
- bundler / dev server: `Vite`
- UI: `React`
- language: `TypeScript`
- styling: `Tailwind CSS`
- 3D / geometry / rendering: `three`

### Runtime policy
- implementation remains **TypeScript-first**
- AO bake logic remains **renderer-first**
- Electron main process stays thin
- preload + IPC is the only desktop bridge

---

## Architecture Policy

This project is **renderer-first**.

### Renderer responsibilities
- UI
- FBX loading
- mesh listing and selection
- influence mesh selection
- 3D preview
- AO preview
- AO bake orchestration
- AO bake worker integration
- PNG buffer generation

### Main process responsibilities
- app startup
- BrowserWindow creation
- native open/save dialogs
- narrow file read/write flow

### Preload responsibilities
- expose a narrow API via `contextBridge`
- bridge file open / save
- never expose raw Node or broad IPC access

### Important rule
The AO baking core should stay in **TypeScript in the renderer-side app architecture**.

Do **not** move the bake core into:

- native addons
- Rust
- Go
- external binaries
- remote services

unless there is explicit approval and a demonstrated need.

The current direction is:

- UI / preview / load / save stay in Electron + React + three
- bake computation may use workers
- future backend evolution must preserve this app shell unless explicitly changed

---

## Current Bake Strategy

The shipping bake backend is currently **ray-based AO**.

It is implemented as:

- UV-space surface sampling
- BVH-backed ray occlusion checks
- hemisphere sampling
- edge-aware cleanup
- UV padding

Current core modules:

- `src/lib/aoBake.ts`
- `src/lib/rayAoBake.ts`
- `src/lib/rayAoCore.ts`
- `src/lib/rayAoWorker.ts`

### Important history / rule
The old `GPU directional depth-map accumulation` path has been removed.

Do **not** reintroduce that path casually.
If a new bake backend is explored, it should be done deliberately and compared against the current ray-based path.

---

## Preferred AO Method

The intended AO method is:

**Evaluate occlusion for the surface point represented by each texel in UV space.**

At a high level:

1. choose the bake UV channel
2. map texels to surface points from UV triangles
3. reconstruct world position and world normal
4. evaluate hemispherical occlusion against selected influence meshes
5. write the result into a UV-matching texture
6. post-process with cleanup / padding
7. preview and export PNG

This is an **offline texture bake**, not a runtime screen-space effect.

---

## Quality Policy

This app should optimize for **usable avatar AO**, not just speed.

Desired qualities:

- stable UV-space output
- good behavior on close body / clothes / hair situations
- predictable grayscale output for Unity workflows
- settings that scale upward in quality without absurd bake times

Known problem patterns to design against:

- self-occlusion acne
- thin shell / front-back contamination
- close clothing contamination
- stacked / mirrored UV instability
- visible UV seams and insufficient padding

When choosing between speed and correctness for body AO, prefer the result that produces cleaner bake output for practical avatar assets.

---

## Performance Policy

Practical waits are acceptable.
Extremely long waits are not.

Guidance:

- `128px` internal map: preview only
- `1024px` internal map: current practical default
- `2048px` internal map: quality-focused final bake
- rays are currently fixed at `64`

The implementation should avoid designs that normalize very long bake times for normal usage.

Heavy bake work should stay off the main UI thread when feasible.
The current expectation is worker-based execution for the bake core.

---

## Current Product Decisions

- bake backend is `ray-based AO` only
- output sizes are `2048 x 2048` and `4096 x 4096`
- internal sample map options are `128`, `1024`, `2048`
- `Preview` uses `128` by design
- `SkinnedMesh` is supported only as static pose
- target mesh and influence meshes are selected separately
- unchecked influence meshes should not affect the bake
- unchecked influence meshes are dimmed in preview
- AO remap lives in the output section and affects saved PNG output
- `Bake AO` is the only path that enables PNG save
- `Preview` is intentionally unsavable
- current profiles:
  - `Auto`
  - `Body`
  - `Body Deep AO`
  - `Clothing`
  - `Hair`
  - `Face`
  - `Accessory`
- distance-facing UI is shown in `mm`
- `Backface Hits` and `Cage Extrusion` are always visible in bake controls
- bake progress should remain a minimal one-line status near output actions
- the app should behave as a single-instance desktop app
- Windows packaging target is `nsis x64`

Do not silently change these defaults without also updating:

- profile logic
- UI text
- docs
- status / roadmap notes if the decision matters long-term

---

## AO Controls

The current meaningful controls are:

- export size: `2048`, `4096`
- internal map: `128`, `1024`, `2048`
- rays: fixed `64`
- max distance
- ray bias
- cage extrusion
- backface hits
- padding
- UV channel

These should remain understandable for non-technical users.
Use `mm` display in UI where possible.

Avoid adding low-signal controls unless they materially improve output quality.

The current output-side controls are:

- AO remap strength
- AO remap contrast
- AO remap gamma

These belong with the baked output preview, not the left-side bake settings.

---

## UV Policy

### Default bake target
Default bake target is **UV0**, which in three.js is `uv`.

### Optional support
If `uv2` exists, it may be exposed as an optional alternative.

### Rules
- `uv` is the standard path
- `uv2` is optional
- missing selected UV channel must block baking with a clear error
- overlapping / mirrored / stacked UVs are allowed and should be handled as robustly as practical
- UV padding is required behavior, not just a future idea

### Output semantics
- output is a grayscale PNG matching the selected UV layout
- the app does not re-embed textures into the FBX
- users apply the PNG manually later

---

## Mesh Handling Policy

- list mesh candidates from the loaded scene
- bake only **one selected target mesh at a time**
- allow separate influence mesh selection
- support non-bakeable meshes as occluders if useful
- `SkinnedMesh` may remain partial, static-pose only

Influence selection is core to product quality.
Do not regress this into a model-wide always-on occlusion design.

---

## Input and Output Requirements

### Input
- `.fbx` only
- local file loading only

### Output
- grayscale PNG
- native save dialog when Electron bridge is available
- browser download fallback when bridge is unavailable
- default filename should remain mesh-oriented, e.g. `<mesh-name>_ao.png`

---

## Allowed Dependencies

### Core
- `three`
- `three-mesh-bvh`
- `tailwindcss`
- `@tailwindcss/vite`
- `electron`

### Allowed if clearly needed
- `electron-builder` or equivalent
- `concurrently`
- `wait-on`

Keep dependencies minimal.

---

## Disallowed Unless Explicitly Approved

- `@react-three/fiber`
- `@react-three/drei`
- UI component libraries
- large state management libraries
- native addons
- WASM rendering pipelines
- Tauri
- Wails
- external backend services
- sidecar binaries
- renderer-side Node integration

Prefer solving problems with:

- `three`
- Web APIs
- Electron standard capabilities
- internal utility code

---

## UI Policy

The UI is now intentionally **desktop-first** and **16:9-oriented**.

### Current layout rule
- left column: control island
- right column: preview stage
- left column may scroll internally
- page-level scroll should be avoided
- right side should feel like a stable stage, not a responsive document stack

### Left column responsibilities
- workspace / file open
- target mesh selection
- influence mesh selection
- bake settings

### Right column responsibilities
- `Scene Preview`
- `Baked AO Output`
- AO remap
- preview / bake / save actions
- a minimal bake status line near output actions
- output actions belong with the AO output section

### Visual and interaction rules
- dark theme
- compact controls
- avoid oversized buttons and wasted space
- keep clear visual grouping
- avoid auto-reflow that destroys the intended desktop composition unless explicitly requested

If changing layout:

- preserve the 16:9 desktop composition by default
- do not casually reintroduce full-page scroll
- prefer local panel scrolling or fixed preview stages

---

## Preview Interaction Policy

### Scene Preview
Current intended interaction:

- middle mouse drag: rotate
- left drag: pan
- wheel: zoom

These interactions must stay local to the preview viewport and must not interfere with the app window itself.

### Baked AO Output
Current intended interaction:

- wheel: zoom
- drag: pan
- double-click: reset

This interaction should feel smooth and direct.
Prefer local transform updates over laggy state-heavy drag behavior.
Prefer canvas-based output preview rendering over CSS image transforms when display sharpness matters.

---

## Desktop App Policy

This remains an Electron desktop app.

### Do
- keep preload narrow
- keep IPC explicit
- keep packaging in mind
- support native open/save
- keep single-instance behavior
- preserve browser fallback where useful for degraded environments

### Do not
- enable unsafe renderer-side Node access
- move bake work into the main process
- overcomplicate the app shell

---

## Security Policy

Required defaults:

- `contextIsolation: true`
- `nodeIntegration: false`

Preferred if practical:

- `sandbox: true`

Additional rules:

- never expose raw `ipcRenderer`
- never expose broad filesystem access to the renderer
- expose only narrow task-specific preload APIs
- keep IPC channels explicit and purpose-specific

---

## Current Important Files

- `electron/main.ts`
- `electron/ipc/dialog.ts`
- `electron/ipc/file.ts`
- `electron/preload.ts`
- `shared/ipc.ts`
- `src/App.tsx`
- `src/components/ControlPanel.tsx`
- `src/components/InfluencePanel.tsx`
- `src/components/PreviewPane.tsx`
- `src/components/TexturePreview.tsx`
- `src/lib/scene.ts`
- `src/lib/loadFbx.ts`
- `src/lib/collectMeshes.ts`
- `src/lib/aoBake.ts`
- `src/lib/disposeScene.ts`
- `src/lib/imageExport.ts`
- `src/lib/rayAoBake.ts`
- `src/lib/rayAoCore.ts`
- `src/lib/rayAoWorker.ts`
- `src/lib/recommendBakeSettings.ts`
- `src/lib/recommendInfluenceMeshes.ts`
- `src/lib/types.ts`

---

## Recommended Directory Structure

```text
avatar-ao-baker/
  electron/
    ipc/
      dialog.ts
      file.ts
    main.ts
    preload.ts
  shared/
    ipc.ts
  src/
    App.tsx
    main.tsx
    index.css
    components/
      ControlPanel.tsx
      InfluencePanel.tsx
      PreviewPane.tsx
      TexturePreview.tsx
    lib/
      scene.ts
      loadFbx.ts
      collectMeshes.ts
      aoBake.ts
      disposeScene.ts
      imageExport.ts
      rayAoBake.ts
      rayAoCore.ts
      rayAoWorker.ts
      recommendBakeSettings.ts
      recommendInfluenceMeshes.ts
      types.ts

  docs/
    README.md
    ROADMAP.md
    STATUS.md
    TESTER_STRESS_TEST.md
  .gitignore
  .gitattributes
  README.md
  package.json
  vite.config.ts
  tsconfig.json
```

---

## Working Rule

If future implementation decisions conflict, bias toward:

1. cleaner avatar AO output
2. predictable target / influence behavior
3. UI clarity on desktop
4. stable Electron architecture
5. minimal complexity increase
