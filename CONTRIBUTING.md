# Contributing

Thanks for your interest in improving `face-verification-api`. This is a small, deliberately auditable library — contributions that keep it readable and honest about its limitations are very welcome.

## Where help is most useful

The highest-value work is closing the documented [Open Risks](./README.md#open-risks):

- **Stronger print liveness** (Open Risks → liveness) — the default already ensembles MiniFASNetV2 (@2.7) + MiniFASNetV1SE (@4.0), but print can still occasionally pass. Further directions: a depth or challenge-response signal, a stronger anti-spoof model, or per-deployment liveness-threshold calibration on live-vs-print captures.
- **Threshold calibration** — calibration data and a documented methodology for the recognition and liveness thresholds.
- **BYO-model validation** — when swapping in a different recognition model or `.task` bundle, confirm its input layout, channel order, and landmark indices (the bundled defaults are already verified).

## Development setup

```bash
git clone <your-fork>
cd face-verification-api
npm install
npm run download -- models   # weights into models/ for the demo / integration runs
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

- **Coverage** — `npm run coverage` runs the unit tests with a v8 coverage report and **enforces thresholds** (CI gates on it). Browser-only files (`detect.ts`, `models.ts`) and type-only files are excluded from the denominator; browser-only functions elsewhere (e.g. `warpFace`, `cropForLiveness`, `toImageData`) stay uncovered in Node, which is why the floors leave margin.

Keep `npm run coverage` green and `npx tsc --noEmit` clean before opening a PR. If you touch the decision/flag logic in `compare.ts`, add or update a unit test.

### Test fixtures

Use only **CC0 or self-provided** images. Never commit scraped or third-party face photos (see Open Risks → calibration data).

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
3. Ensure `npm run lint`, `npm run format:check`, `npx tsc --noEmit`, and `npm run coverage` all pass.
4. Describe what you changed and, for model/correctness changes, how you verified it.
5. Update `README.md` / `INSTALL.md` if behavior, options, or flags change.

## Releasing (maintainers)

Automated with [release-please](https://github.com/googleapis/release-please) +
npm OIDC trusted publishing — no version bumping, no `NPM_TOKEN`, no tagging by hand.

**How it works:**

1. Land Conventional Commits on `main` (`feat:` → minor, `fix:` → patch,
   `feat!:`/`BREAKING CHANGE:` → major). Pushing code does **not** publish.
2. `release-please` keeps a **release PR** open, maintaining the next version in
   `package.json` + `.release-please-manifest.json` and the [CHANGELOG.md](./CHANGELOG.md)
   from those commits. It updates as more commits land.
3. **Merge the release PR** when you want to ship. That creates the `vX.Y.Z` tag
   + GitHub release and, in the same workflow run, runs `npm publish --provenance`
   via OIDC. Only `dist/` + `NOTICE` + the `bin/` downloader ship (the `files`
   field); model weights are never bundled.

**One-time setup:**

- **npm trusted publisher:** on npmjs.com → the package → Settings → Trusted
  Publishing → add this repo and the `release-please.yml` workflow. (For the very
  first publish, if the package doesn't exist yet, you may need a one-time
  `npm publish` locally — or a temporary token — to create it, then OIDC handles
  every release after.)
- **Allow Actions to open PRs:** Settings → Actions → General → Workflow
  permissions → enable "Allow GitHub Actions to create and approve pull requests"
  (release-please opens the release PR).

The release PR goes through the same `main` branch checks as any other PR.

## License of contributions

By contributing, you agree your code is licensed under the project's [MIT License](./LICENSE). Model weights remain under their own licenses (see [NOTICE](./NOTICE)).
