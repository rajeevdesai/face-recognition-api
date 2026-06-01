# face-recognition-api

[![CI](https://github.com/rajeevdesai/face-recognition-api/actions/workflows/ci.yml/badge.svg)](https://github.com/rajeevdesai/face-recognition-api/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@rajeevdesai/face-recognition)](https://www.npmjs.com/package/@rajeevdesai/face-recognition)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Browser-only **1:1 face verification** library. Custom pipeline — no wrapper libraries, fully auditable, open-sourceable.

Answers one question: *"Is the face in image B the same person as the face in image A?"* — entirely client-side, with no biometric data leaving the browser.

```
MediaPipe FaceLandmarker → Umeyama alignment → MobileFaceNet ONNX → cosine distance
                                                      (+ optional MiniFASNetV2 liveness)
```

> ⚠️ **Not a sole authentication factor.** The bundled liveness model reliably rejects screen/video **replay**, but **print** detection is imperfect — a printed photo can occasionally pass as live. Pair with another factor for anything security-critical. See [Open Risks](#open-risks).

---

## Contents

- [What this solves](#what-this-solves)
- [What it does *not* do](#what-it-does-not-do)
- [How it works](#how-it-works)
- [Install](#install)
- [Quick start](#quick-start)
- [API reference](#api-reference)
- [Liveness](#liveness)
- [Threshold & calibration](#threshold--calibration)
- [Integration notes](#integration-notes)
- [Demo](#demo)
- [Tests](#tests)
- [Open Risks](#open-risks)
- [Licensing](#licensing)
- [Contributing](#contributing)

---

## What this solves

- **1:1 verification** — confirm two images are (or aren't) the same identity. Typical uses: matching a selfie to an ID photo, re-verifying a returning user, enrollment-frame comparison.
- **Privacy by default** — detection, alignment, embedding, and matching all run in the browser via WASM. No image or biometric template is uploaded.
- **Auditable** — the entire pipeline (alignment math, preprocessing, distance metric) lives in readable TypeScript. No opaque third-party recognition SDK.
- **Actionable fraud signals** — every result carries structured [flags](#flags) (missing face, multiple faces, low confidence, liveness fail) so your app can branch on them.

## What it does *not* do

- **No 1:N identification / search.** It compares two faces; it does not search a gallery or database of identities.
- **No bulletproof liveness.** Screen/video replay is reliably rejected, but print attacks are caught only unreliably — a printed photo can occasionally pass (see [Open Risks](#open-risks)). Treat liveness as one signal, not a guarantee.
- **No calibrated probability.** `confidence` is a margin below the threshold, not a true match probability.
- **No perfect accuracy.** Recognition is bounded by the embedding model — `facex_nano` scores ~95.62% on LFW, and harder in-the-wild captures (pose, lighting, occlusion) do worse. Calibrate and expect some error.
- **No server / Node runtime.** Requires browser APIs (`createImageBitmap`, `OffscreenCanvas`, WASM). It will not run under Node or SSR.
- **No bundled weights.** Models are downloaded separately (license + size reasons).

## How it works

1. **Decode** (`image.ts`) — normalize each input (`HTMLImageElement | ImageData | string`) to `ImageData`.
2. **Detect** (`detect.ts`) — MediaPipe FaceLandmarker returns 468/478 landmarks per face; faces are sorted largest-first.
3. **Align** (`align.ts`) — five ArcFace keypoints are extracted, then an Umeyama similarity transform warps the face to the canonical 112×112 ArcFace pose.
4. **Embed & compare** (`embed.ts`) — MobileFaceNet produces an L2-normalized embedding per face; identity distance is `1 − cosine similarity`.
5. **Liveness** (`liveness.ts`, optional) — MiniFASNetV2 scores the matched face for spoofing.
6. **Decide** (`compare.ts`) — a match requires *both* identity (distance ≤ threshold) *and* liveness; flags are emitted along the way.

## Install

```bash
npm install @rajeevdesai/face-recognition
# peer deps (often already present in your app):
npm install onnxruntime-web @mediapipe/tasks-vision

# download the model weights into ./models
bash models/download.sh
```

Then **serve the `models/` directory** alongside your app so the browser can fetch the `.task` / `.onnx` files at runtime.

👉 Full step-by-step setup, model hosting, WASM hosting, and framework-specific notes: **[INSTALL.md](./INSTALL.md)**.

## Quick start

```typescript
import { loadModels, compareFaces } from '@rajeevdesai/face-recognition';

// Once at app startup — loads & caches all three models.
await loadModels({
  faceLandmarkerPath: '/models/face_landmarker.task',
  recognitionModelPath: '/models/mobilefacenet.onnx',
  livenessModelPath: '/models/minifasnet_v2.onnx',  // required
  // wasmBasePath: '/wasm/'  ← only if ort .wasm files aren't on the default CDN
});

// Per comparison:
const result = await compareFaces(baselineImage, currentImage);
console.log(result.match, result.confidence, result.flags);
```

## API reference

### `loadModels(config)`

Loads and caches the three models as singletons. Safe to call multiple times — subsequent calls are no-ops once loaded. Must run before `compareFaces`.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `faceLandmarkerPath` | no | `models/face_landmarker.task` | MediaPipe FaceLandmarker `.task` |
| `recognitionModelPath` | no | `models/mobilefacenet.onnx` | Embedding model ONNX |
| `livenessModelPath` | **yes** | — | MiniFASNetV2 anti-spoofing ONNX |
| `wasmBasePath` | no | jsDelivr CDN | Base URL for MediaPipe + onnxruntime-web `.wasm` |
| `warmup` | no | `true` | Run a dummy inference to avoid first-call latency |

### `compareFaces(baseline, current, options?)`

Each image accepts `HTMLImageElement | ImageData | string`. Safe string formats:

- `data:` URLs
- `blob:` URLs (e.g. `URL.createObjectURL(file)`)
- same-origin URLs
- CORS-enabled cross-origin URLs

Cross-origin **non-CORS** URLs will fail — use `data:` or `blob:` for file inputs.

**Options**

| Option | Default | Description |
|--------|---------|-------------|
| `threshold` | `0.5` | Cosine-distance match cutoff. Lower = stricter. **Uncalibrated** — see [calibration](#threshold--calibration). |
| `livenessThreshold` | `0.5` | Liveness score must meet this to pass. Uncalibrated. |
| `checkLiveness` | `true` | Set `false` to skip the liveness model entirely. |

**Result shape**

```typescript
interface CompareResult {
  match: boolean;
  confidence: number;      // 0–1, margin below threshold (NOT a calibrated probability)
  flags: FraudFlag[];
  details: {
    baselineFacesFound: number;
    currentFacesFound: number;
    cosineDistance: number;  // lower = more similar
    threshold: number;
    livenessScore?: number;  // 0–1; present only when the liveness check ran
  };
}
```

### Flags

| Flag | Meaning |
|------|---------|
| `baseline_missing` | 0 faces in baseline — `match` is false |
| `baseline_ambiguous` | >1 face in baseline — largest used, comparison continues |
| `face_missing` | 0 faces in current — `match` is false |
| `multiple_faces` | >1 face in current — best match used (weakens anti-fraud, documented) |
| `identity_mismatch` | distance > threshold |
| `low_confidence` | matched, but distance sits in the grey zone (80–100% of threshold) |
| `liveness_fail` | liveness score below threshold (spoof suspected) — `match` forced false |

### Bring your own model

```typescript
await loadModels({ recognitionModelPath: '/path/to/your-model.onnx', livenessModelPath: '/models/minifasnet_v2.onnx' });
```

A consumer-supplied recognition model must match the expected input spec: `[1, 3, 112, 112]` Float32 NCHW, RGB, values in `[-1, 1]`, outputs a fixed-length embedding (the `facex_nano` default is 256-D; any consistent dimension works since baseline and current use the same model).

## Liveness

A liveness check (MiniFASNetV2) runs on the matched face by default. The score is `0–1`; below `livenessThreshold` it sets the `liveness_fail` flag and forces `match: false`.

```typescript
await compareFaces(a, b, {
  livenessThreshold: 0.5,  // default; uncalibrated — tune on your own live/spoof set
  checkLiveness: false,    // skip the liveness model entirely
});
```

**Reliable for replay, imperfect for print.** MiniFASNetV2 reliably rejects screen/video replay, but print detection is imperfect — a printed photo can occasionally score as live. Do **not** treat `liveness_fail` as a complete spoof defense — see [Open Risks](#open-risks).

## Threshold & calibration

The default **0.5 cosine distance** is an uncalibrated placeholder. Before production:

1. Assemble a labelled set of same-person and different-person image pairs representative of your capture conditions.
2. Run `compareFaces` across them and record `details.cosineDistance` per pair.
3. Pick the threshold that best separates the two distributions for your tolerance of false accepts vs false rejects. Typical ArcFace LFW thresholds land around 0.4–0.5.
4. Pass it per call: `compareFaces(a, b, { threshold: 0.45 })`.

Repeat the same exercise for `livenessThreshold` using real live captures vs spoof samples.

## Integration notes

- **Browser only.** Guard against SSR — call `loadModels` from a client-side effect, never during server render.
- **Load once.** Models are module singletons; calling `loadModels` repeatedly is cheap but only the first call does work.
- **No special headers.** Inference is single-threaded (`numThreads = 1`), so you do **not** need cross-origin isolation (COOP/COEP).
- **Host the models.** Serve `models/` (and optionally the ort `.wasm` blobs) from a path your app can fetch. See [INSTALL.md](./INSTALL.md).
- **File inputs.** For `<input type="file">`, pass `URL.createObjectURL(file)` (a `blob:` URL) or a `data:` URL.

React sketch:

```tsx
useEffect(() => {
  loadModels({
    faceLandmarkerPath: '/models/face_landmarker.task',
    recognitionModelPath: '/models/mobilefacenet.onnx',
    livenessModelPath: '/models/minifasnet_v2.onnx',
  }).catch(console.error);
}, []);

async function onVerify(idPhoto: string, selfie: File) {
  const result = await compareFaces(idPhoto, URL.createObjectURL(selfie));
  // branch on result.match / result.flags
}
```

## Demo

```bash
npm install
npm run demo   # builds, then serves at http://localhost:5299
```

Open `demo/index.html` and upload images from `tests/fixtures/` to exercise the full pipeline end-to-end.

## Tests

```bash
npm test   # Node-safe unit tests: Umeyama math + flag logic
```

Integration tests require browser APIs and are auto-skipped in Node. Run them via the demo (upload fixtures manually) or with `vite-node` if browser polyfills are available. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the testing strategy.

## Open Risks

1. **Recognition model extractability** *(verified)* — the downloaded `mobilefacenet.onnx` loads as a plain, unencrypted ONNX graph (input `input`, output `embedding` `[1,256]`). No fallback needed for the default weights.
2. **Preprocessing layout** *(verified)* — confirmed NCHW `[1,3,112,112]`: inference on that shape succeeds and yields the expected 256-D embedding (an HWC graph would reject it). A consumer-supplied model with a different layout still needs its own check.
3. **Landmark indices** — iris indices 468/473 are verified against the 478-landmark FaceLandmarker. Confirm against the specific `.task` bundle you download.
4. **Threshold** — the default 0.5 is uncalibrated. Measure on your own data.
5. **Test fixtures** — use CC0 / self-provided images, never scraped faces.
6. **Liveness is not a complete spoof defense** *(validated 2026-06-02)* — with correct `[0,255]` preprocessing, MiniFASNetV2 reliably rejects screen/video replay (replay class ~0.9999) and passes live faces (~0.88–0.96). Print is the weak spot: usually rejected, but one capture false-accepted (scored 0.882 live), and the live/print score ranges overlap — a single threshold can't cleanly separate them. Hardening path: ensemble the second minivision model (MiniFASNetV1SE, 4.0 crop) and sum the softmaxes. `livenessThreshold` (default 0.5) is uncalibrated.
7. **Liveness output format** *(validated 2026-06-02)* — the model emits **3-class logits** (softmax them). The **live class is index 1** (minivision convention: label 1 = real). Input must be raw **`[0,255]`** BGR, *not* `[0,1]` — at `[0,1]` this export is degenerate, collapsing every input to index 2 (~0.99); that artifact previously masqueraded as "index 2 = live". Index 2 is the screen/video-replay spoof class; index 0 is another spoof class. The garciafido model card's index-0 claim is wrong for these weights.

## Licensing

- **Our code:** MIT (see [LICENSE](./LICENSE)).
- **Model weights:** Apache-2.0 (see [NOTICE](./NOTICE) for attribution and the MS1M-RefineV2 data caveat).
- Models are **not** bundled — downloaded separately via `models/download.sh`. Consumers are responsible for compliance with the applicable model licenses.

## Contributing

Contributions welcome — bug fixes, calibration data, and especially help closing the [Open Risks](#open-risks). See **[CONTRIBUTING.md](./CONTRIBUTING.md)**.
