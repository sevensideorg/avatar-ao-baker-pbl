# Repository Guidelines

## Project Structure & Module Organization

- `src/`: renderer UI and AO baking logic. Components live in `src/components/`; reusable baking, scene, and export logic lives in `src/lib/`.
- `electron/`: Electron main process, preload bridge, and IPC handlers.
- `shared/`: types and constants shared between renderer, preload, and main process.
- `scripts/`: development helper scripts, written in TypeScript.
- `svg/`: application icon assets.
- Ignored/generated paths include `docs/`, `dist/`, `dist-electron/`, `dist-scripts/`, `release/`, and `node_modules/`.

## Build, Test, and Development Commands

- `pnpm dev`: runs Vite, Electron TypeScript watch, and the Electron app launcher.
- `pnpm build`: builds renderer and Electron main/preload output.
- `pnpm run dist:win`: creates the Windows NSIS installer in `release/`.
- `pnpm run pack:win`: creates an unpacked Windows build for smoke testing.
- `pnpm run typecheck`: runs TypeScript 7 native preview (`tsgo`) on the `extra` branch.
- `pnpm run typecheck:compare`: checks both TypeScript 6 `tsc` and TypeScript 7 `tsgo`.
- `pnpm run typecheck:strict`: checks renderer code with `tsgo` and unused-symbol flags.
- `pnpm run test:ao`: runs AO regression tests with Vitest.

## Coding Style & Naming Conventions

Use TypeScript for all new code. Keep React components in PascalCase, functions and variables in camelCase, and shared types/interfaces in clear PascalCase names. Prefer runtime validation at IPC boundaries; do not trust renderer-provided payloads by type alone. Avoid `any`, `@ts-ignore`, and broad casts. For DOM/select values, use allowlist parsing instead of direct union casts.

Styling is Tailwind CSS v4 plus normal CSS. Follow the existing visual system. Do not add dependencies without a clear reason.

## Testing Guidelines

Vitest is used for AO regression coverage. Test files follow `*.test.ts` naming, currently focused on `src/lib/rayAoCore.test.ts`. Add synthetic geometry tests for AO behavior changes, especially UV coverage, padding/upscale, cancellation, and denoise-sensitive logic. Before release builds, run `typecheck:compare`, `typecheck:strict`, `test:ao`, and `build`.

## Commit & Pull Request Guidelines

Use concise imperative commit messages, matching existing history, for example `Harden TypeScript IPC boundaries` or `Prepare 0.1.2 TypeScript 7 preview build`.

Pull requests should include a short summary, validation commands run, and screenshots or screen recordings for UI changes. For release changes, note the version, installer path, and known warnings such as unsigned Windows SmartScreen prompts.

## Security & Configuration Tips

Do not commit `.env*`, generated builds, release folders, or local docs. Keep `docs/` as local development notes unless explicitly requested otherwise. Windows installer output is unsigned; communicate that in release notes.
