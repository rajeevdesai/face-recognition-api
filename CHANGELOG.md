# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Bring-your-own-model configuration on `loadModels`: `recognition` and `liveness`
  preprocessing/metric overrides (`inputSize`, `layout` NCHW/NHWC, `channelOrder`
  RGB/BGR, `mean`, `std`, plus `l2normalize`/`metric` for recognition and
  `cropScale`/`liveClassIndex`/`applySoftmax` for liveness). Models that don't match
  the bundled defaults now work without forking.
- `livenessModelPath` is now optional — omit it to disable the liveness stage
  entirely; `checkLiveness` then defaults to false.
- `euclidean` distance metric (in addition to the default cosine).
- `demo/calibrate.html` — in-browser threshold calibration over a labelled
  (`identity/image.jpg`) folder: same/different distance distributions, EER and
  best-accuracy thresholds, FAR/FRR. Works with a BYO recognition model.
- GitHub Pages deploy workflow (`.github/workflows/pages.yml`) that builds the
  library, fetches the model weights, and publishes the webcam demo. "Try the
  live demo" link in the README.
- Liveness ensembling: `livenessModelPath` accepts an array and the per-model
  live scores are averaged. The default setup pairs MiniFASNetV2 (@2.7) with
  MiniFASNetV1SE (@4.0) to harden print detection; the downloader fetches both.
- Test coverage gating: `npm run coverage` (v8) with enforced thresholds, wired
  into CI.
- Cross-platform weights downloader CLI: `npx @rajeevdesai/face-verification-api
  download <dir>` (also `npm run download`). Writes the four weights straight into
  a directory you choose — no bash, no `node_modules` copying.
- Claude Code integration skill at `.claude/skills/face-verification-api/` so
  consumers' Claude Code knows the API, config, gotchas, and calibration.

### Changed

- `CompareResult.details.cosineDistance` renamed to `details.distance` (metric-agnostic).
- Package renamed `@rajeevdesai/face-recognition` → `@rajeevdesai/face-verification-api`
  to match the repository (never published, so no migration).
- Replaced the bash `models/download.sh` with the cross-platform `bin` downloader
  above (works on Windows; single source for the weight URLs).

## [0.1.0] - 2026-06-01

Initial release.

### Added

- Browser-only 1:1 face verification pipeline: MediaPipe FaceLandmarker → Umeyama
  alignment → MobileFaceNet (`facex_nano`) embedding → cosine distance.
- `loadModels()` — loads and caches the landmarker, recognition, and liveness models
  as singletons, with optional warmup.
- `compareFaces(baseline, current, options?)` — returns a structured `CompareResult`
  with `match`, `confidence`, fraud `flags`, and `details`.
- Optional MiniFASNetV2 passive liveness check (reliably rejects screen/video replay; print detection imperfect).
- Configurable `threshold`, `livenessThreshold`, and `checkLiveness` options.
- `models/download.sh` for fetching the three model weights (not bundled).
- Unit tests (Umeyama math + decision/flag logic) and a browser integration suite.

### Known limitations

See [Open Risks](./README.md#open-risks). Notably: liveness rejects screen/video
replay but does not reliably catch print attacks, and the default thresholds are
uncalibrated placeholders.

[Unreleased]: https://github.com/rajeevdesai/face-verification-api/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rajeevdesai/face-verification-api/releases/tag/v0.1.0
