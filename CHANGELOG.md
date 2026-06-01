# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/rajeevdesai/face-recognition-api/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rajeevdesai/face-recognition-api/releases/tag/v0.1.0
