# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1](https://github.com/rajeevdesai/face-verification-api/compare/v0.2.0...v0.2.1) (2026-06-02)


### Bug Fixes

* add types condition to package exports map ([cc83246](https://github.com/rajeevdesai/face-verification-api/commit/cc832462f243f679aac17df6b1914112460e4433))
* add types condition to package exports map ([14fe51c](https://github.com/rajeevdesai/face-verification-api/commit/14fe51c4ad775467f501f7866c617dc9c02f9a6c))

## [0.2.0](https://github.com/rajeevdesai/face-verification-api/compare/v0.1.0...v0.2.0) (2026-06-02)


### Features

* add browser 1:1 face verification pipeline ([8e0883a](https://github.com/rajeevdesai/face-verification-api/commit/8e0883a8fb2d90a9bb2a415635562fd41cbe4e23))
* configurable preprocessing + bring-your-own-model ([244a86d](https://github.com/rajeevdesai/face-verification-api/commit/244a86d2bd0801567c6053c8bf3e5be33d6625be))
* **demo:** add threshold calibration harness ([739615d](https://github.com/rajeevdesai/face-verification-api/commit/739615d8636652fe983cabf95e90c8258463aced))
* **liveness:** default V2+V1SE ensemble to harden print detection ([1b84352](https://github.com/rajeevdesai/face-verification-api/commit/1b84352016f2b020573b78414895724b62ef963a))
* npx weights downloader, replace download.sh ([c3c0bac](https://github.com/rajeevdesai/face-verification-api/commit/c3c0baceeb7221db75ad15afd5da16a4912af6f2))


### Bug Fixes

* honest integration-test skipping + gitignore face fixtures ([fde7122](https://github.com/rajeevdesai/face-verification-api/commit/fde712206169da05cbcef55f3e9651805a7ecfd6))
* **liveness:** feed [0,255], live class is index 1 ([31de455](https://github.com/rajeevdesai/face-verification-api/commit/31de455d6843bbefd6ea494fc99e551817762860))
* **test:** use renamed details.distance in integration test ([85fd4fa](https://github.com/rajeevdesai/face-verification-api/commit/85fd4fa0a029ebae284c3c3283f29e84f8c01899))

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
