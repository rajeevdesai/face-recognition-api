# Contributing

Thanks for your interest in improving `face-recognition-api`. This is a small, deliberately auditable library — contributions that keep it readable and honest about its limitations are very welcome.

## Where help is most useful

The highest-value work is closing the documented [Open Risks](./README.md#open-risks):

- **Stronger print liveness** (Open Risk #6) — the default already ensembles MiniFASNetV2 (@2.7) + MiniFASNetV1SE (@4.0), but print can still occasionally pass. Further directions: a depth or challenge-response signal, a stronger anti-spoof model, or per-deployment liveness-threshold calibration on live-vs-print captures.
- **Threshold calibration** — calibration data and a documented methodology for the recognition and liveness thresholds.
- **Preprocessing / layout validation** (Open Risks #1–#3) — confirming model input layout and landmark indices against the shipped weights.

## Development setup

```bash
git clone <your-fork>
cd face-recognition-api
npm install
bash models/download.sh   # needed for the demo / integration runs
```

## Project layout

| Path | Role |
|------|------|
| `src/image.ts` | Input decoding → `ImageData` |
| `src/detect.ts` | MediaPipe detection + landmarks |
| `src/align.ts` | Five-point extraction + Umeyama warp |
| `src/embed.ts` | Embedding + cosine distance |
| `src/liveness.ts` | MiniFASNetV2 anti-spoofing |
| `src/compare.ts` | Top-level `compareFaces` orchestration |
| `src/models.ts` | Model loading / singletons |
| `src/types.ts` | Public types |

## Testing

There are two tiers, split by what can run without a browser:

- **Unit tests** (`tests/compare.test.ts`, `tests/align.test.ts`) — Node-safe. They cover the Umeyama math and the flag/decision logic with the model layer mocked. Run with `npm test`.
- **Integration tests** (`tests/integration.test.ts`) — require browser APIs (`createImageBitmap`, `OffscreenCanvas`, WASM) and are auto-skipped in Node. Exercise them via `npm run demo` and the fixtures, or with `vite-node` if browser polyfills are available.

Keep `npm test` green and `npx tsc --noEmit` clean before opening a PR. If you touch the decision/flag logic in `compare.ts`, add or update a unit test.

### Test fixtures

Use only **CC0 or self-provided** images. Never commit scraped or third-party face photos (Open Risk #5).

## Code style

- TypeScript, strict mode. Run `npx tsc --noEmit`.
- Lint with `npm run lint` (ESLint) and format with `npm run format` (Prettier). CI runs both.
- The compact linear-algebra blocks in `align.ts`/`embed.ts`/`liveness.ts` are wrapped in `// prettier-ignore` on purpose — paired statements map to vectors / matrix rows. Keep that layout.
- Match the surrounding style. Each module has a header comment describing its role in the pipeline — keep it accurate if you change responsibilities.
- Prefer surgical changes: touch only what the change requires; don't refactor unrelated code in the same PR.
- Comment the *why* for non-obvious math or model-specific assumptions; don't narrate obvious code.
- Don't claim a security property the code doesn't deliver. If a model limitation exists, document it in [Open Risks](./README.md#open-risks) rather than hiding it.

## Pull requests

1. Branch off `main`.
2. Keep the PR focused on one concern.
3. Ensure `npm run lint`, `npm run format:check`, `npx tsc --noEmit`, and `npm test` all pass.
4. Describe what you changed and, for model/correctness changes, how you verified it.
5. Update `README.md` / `INSTALL.md` if behavior, options, or flags change.

## Releasing (maintainers)

Published to npm as [`@rajeevdesai/face-recognition`](https://www.npmjs.com/package/@rajeevdesai/face-recognition) via the `Release` GitHub Action.

**One-time setup:** add an `NPM_TOKEN` repository secret — an npm **automation** token for the `@rajeevdesai` scope (Settings → Secrets and variables → Actions).

**Each release:**

1. Bump `version` in `package.json` (semver).
2. Move the `[Unreleased]` notes in [CHANGELOG.md](./CHANGELOG.md) under the new version + date.
3. Commit, then tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```
4. The tag triggers `.github/workflows/release.yml`: lint → type-check → test → `npm publish --provenance`. Only the built `dist/` + `NOTICE` + `models/download.sh` ship (see the `files` field); model weights are never bundled.

A manual `npm publish` also works — `prepublishOnly` builds first — but skips the CI gate and provenance. Prefer the tag.

## License of contributions

By contributing, you agree your code is licensed under the project's [MIT License](./LICENSE). Model weights remain under their own licenses (see [NOTICE](./NOTICE)).
