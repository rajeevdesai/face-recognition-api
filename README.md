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
6. **Decide** (`compare.ts`) — a match requires identity (distance ≤ threshold) and, when liveness is enabled, a passing liveness score; flags are emitted along the way.

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

// Once at app startup — loads & caches the models (liveness optional).
await loadModels({
  faceLandmarkerPath: '/models/face_landmarker.task',
  recognitionModelPath: '/models/mobilefacenet.onnx',
  livenessModelPath: '/models/minifasnet_v2.onnx',  // optional — omit to disable liveness
  // wasmBasePath: '/wasm/'  ← only if ort .wasm files aren't on the default CDN
});

// Per comparison:
const result = await compareFaces(baselineImage, currentImage);
console.log(result.match, result.confidence, result.flags);
```

## API reference

### `loadModels(config)`

Loads and caches the models as singletons (FaceLandmarker + recognition, plus liveness if a path is given). Safe to call multiple times — subsequent calls are no-ops once loaded. Must run before `compareFaces`.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `faceLandmarkerPath` | no | `models/face_landmarker.task` | MediaPipe FaceLandmarker `.task` |
| `recognitionModelPath` | no | `models/mobilefacenet.onnx` | Embedding model ONNX |
| `livenessModelPath` | no | — | Liveness ONNX. **Omit to disable liveness entirely.** |
| `wasmBasePath` | no | jsDelivr CDN | Base URL for MediaPipe + onnxruntime-web `.wasm` |
| `warmup` | no | `true` | Run a dummy inference to avoid first-call latency |
| `recognition` | no | facex_nano spec | Preprocessing/metric overrides for a BYO recognition model — see [Bring your own model](#bring-your-own-model) |
| `liveness` | no | MiniFASNetV2 spec | Preprocessing/class overrides for a BYO liveness model |

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
| `threshold` | `0.5` | Match cutoff in the configured distance metric (default cosine). Lower = stricter. **Uncalibrated** — see [calibration](#threshold--calibration). |
| `livenessThreshold` | `0.5` | Liveness score must meet this to pass. Uncalibrated. |
| `checkLiveness` | auto | Defaults to `true` when a liveness model is loaded, `false` otherwise. Set `false` to skip; passing `true` with no liveness model throws. |

**Result shape**

```typescript
interface CompareResult {
  match: boolean;
  confidence: number;      // 0–1, margin below threshold (NOT a calibrated probability)
  flags: FraudFlag[];
  details: {
    baselineFacesFound: number;
    currentFacesFound: number;
    distance: number;        // configured metric (default cosine); lower = more similar
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

Both the recognition and liveness models are swappable, and their preprocessing is configurable — so a model that doesn't match the bundled defaults works **without forking**. Override only the fields that differ:

```typescript
await loadModels({
  recognitionModelPath: '/models/my-arcface.onnx',
  recognition: {                 // defaults shown
    inputSize: 112,              // square input side
    layout: 'NCHW',              // 'NCHW' | 'NHWC'
    channelOrder: 'RGB',         // 'RGB' | 'BGR'
    mean: 127.5,                 // scalar or [r,g,b]; value = (pixel - mean) / std
    std: 127.5,
    l2normalize: true,           // L2-normalize embeddings before distance
    metric: 'cosine',            // 'cosine' | 'euclidean'
  },
  livenessModelPath: '/models/my-liveness.onnx',  // omit to disable liveness
  liveness: {
    inputSize: 80,
    layout: 'NCHW',
    channelOrder: 'BGR',
    mean: 0,
    std: 1,                      // raw [0,255]; use std 255 for [0,1]
    cropScale: 2.7,              // face-crop expansion factor
    liveClassIndex: 1,           // index of the "live" class in the output
    applySoftmax: true,          // false if the model already outputs probabilities
  },
});
```

**Preprocessing contract.** The aligned crop is mapped `value = (pixel - mean) / std` per channel (pixels in `[0,255]`), in `channelOrder`, laid out per `layout`. The recognition crop is the face warped to the ArcFace 5-point template scaled to `inputSize`, so any `inputSize` is supported. The embedding can be any fixed length (baseline and current use the same model). If distances look wrong for the same person, the usual culprit is `channelOrder`, `layout`, or `mean`/`std`.

**Defaults** (used when `recognition` / `liveness` are omitted):

| | Recognition (facex_nano) | Liveness (MiniFASNetV2) |
|---|---|---|
| `inputSize` | 112 | 80 |
| `layout` | NCHW | NCHW |
| `channelOrder` | RGB | BGR |
| `mean` / `std` | 127.5 / 127.5 → `[-1,1]` | 0 / 1 → raw `[0,255]` |
| other | `l2normalize` true, `metric` cosine | `cropScale` 2.7, `liveClassIndex` 1, `applySoftmax` true |

**Threshold is model-specific.** Distances are not comparable across models — recalibrate `threshold` (and `livenessThreshold`) on your own data whenever you swap the recognition model. See [Threshold & calibration](#threshold--calibration).

**No liveness?** Omit `livenessModelPath`; the liveness stage is skipped entirely (`checkLiveness` defaults to false, `livenessScore` absent).

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

The default **0.5** (cosine distance) is a documented placeholder near common ArcFace LFW operating points (~0.4–0.5) — **not** calibrated for your model, capture conditions, or population. Calibrate before production, and re-calibrate whenever you swap the recognition model (distances aren't comparable across models).

### Calibration harness

`demo/calibrate.html` does this locally — images never leave the browser. Serve the demo (`npm run demo`) and open it, then:

1. Point it at a folder laid out as `identity/image.jpg` (one sub-folder per person).
2. It builds same-person pairs (within an identity) and different-person pairs (across identities), runs the pipeline, and records the distance for each.
3. It reports the two distributions plus the **EER threshold** (where false-accept rate ≈ false-reject rate) and a best-accuracy threshold, with FAR/FRR.

Set `threshold` near the EER value, then bias **lower** (stricter — fewer false accepts) or **higher** (looser — fewer false rejects) per your risk tolerance: `compareFaces(a, b, { threshold: 0.42 })`. Point the harness at a different `recognitionModelPath` + `recognition` config to calibrate a BYO model.

> ⚠️ **Use data you have the right to use.** A face used for identification is biometric personal data (GDPR Art. 9, Illinois BIPA, and similar) — calibrate on consented, self-collected, or CC0 images, **never scraped datasets**. Most well-known "face benchmarks" (LFW, VGGFace2, CelebA, …) are research-only or scraped and are not appropriate for tuning a shipped product. A single global threshold also can't equalize error rates across demographics; audit per-group if fairness matters.

### Liveness threshold

`livenessThreshold` (default 0.5) can't be calibrated from stored photos — it needs **live captures vs spoof attempts** (print/replay). With the bundled MiniFASNetV2, live faces score ~0.88–0.96 and screen replay ~0, so 0.5 cleanly separates those; print attacks overlap the live range (see [Open Risks](#open-risks)).

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

Open `demo/index.html`, capture a **baseline** and a **current** frame from your webcam, and hit Compare to exercise the full pipeline end-to-end. For threshold calibration, open `demo/calibrate.html` — see [Threshold & calibration](#threshold--calibration).

## Tests

```bash
npm test   # Node-safe unit tests: Umeyama math + flag logic
```

Integration tests require browser APIs and are auto-skipped in Node. Run them via the demo (upload fixtures manually) or with `vite-node` if browser polyfills are available. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the testing strategy.

## Open Risks

1. **Recognition model extractability** *(verified)* — the downloaded `mobilefacenet.onnx` loads as a plain, unencrypted ONNX graph (input `input`, output `embedding` `[1,256]`). No fallback needed for the default weights.
2. **Preprocessing layout** *(verified)* — confirmed NCHW `[1,3,112,112]`: inference on that shape succeeds and yields the expected 256-D embedding (an HWC graph would reject it). A consumer-supplied model with a different layout still needs its own check.
3. **Landmark indices** *(verified 2026-06-02)* — the float16 `face_landmarker.task` emits 478 landmarks, and the five extracted points (iris 468/473, nose 1, mouth 61/291) fit `ARCFACE_DST` at ~1-2px RMS, confirming correct image-side pairing (no left/right swap). Re-confirm if you swap in a different `.task` bundle.
4. **Threshold** — the default 0.5 is uncalibrated. Measure on your own (consented) data with `demo/calibrate.html`.
5. **Test fixtures** — use CC0 / self-provided images, never scraped faces.
6. **Liveness is not a complete spoof defense** *(validated 2026-06-02)* — with correct `[0,255]` preprocessing, MiniFASNetV2 reliably rejects screen/video replay (replay class ~0.9999) and passes live faces (~0.88–0.96). Print is the weak spot: usually rejected, but one capture false-accepted (scored 0.882 live), and the live/print score ranges overlap — a single threshold can't cleanly separate them. Hardening path: ensemble the second minivision model (MiniFASNetV1SE, 4.0 crop) and sum the softmaxes. `livenessThreshold` (default 0.5) is uncalibrated.
7. **Liveness output format** *(validated 2026-06-02)* — the model emits **3-class logits** (softmax them). The **live class is index 1** (minivision convention: label 1 = real). Input must be raw **`[0,255]`** BGR, *not* `[0,1]` — at `[0,1]` this export is degenerate, collapsing every input to index 2 (~0.99); that artifact previously masqueraded as "index 2 = live". Index 2 is the screen/video-replay spoof class; index 0 is another spoof class. The garciafido model card's index-0 claim is wrong for these weights.

## Licensing

- **Our code:** MIT (see [LICENSE](./LICENSE)).
- **Model weights:** Apache-2.0 (see [NOTICE](./NOTICE) for attribution and the MS1M-RefineV2 data caveat).
- Models are **not** bundled — downloaded separately via `models/download.sh`. Consumers are responsible for compliance with the applicable model licenses.

## Contributing

Contributions welcome — bug fixes, calibration data, and especially help closing the [Open Risks](#open-risks). See **[CONTRIBUTING.md](./CONTRIBUTING.md)**.
