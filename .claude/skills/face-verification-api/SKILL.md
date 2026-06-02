---
name: face-verification-api
description: >-
  Integrate and use @rajeevdesai/face-verification-api — a browser-only 1:1 face
  verification library (MediaPipe FaceLandmarker → Umeyama align → facex_nano
  embedding → cosine distance + optional MiniFASNet liveness ensemble). Use when
  the user is adding face verification / face matching / "is this the same
  person" / selfie-vs-ID / liveness / anti-spoofing to a browser app, or is
  calling loadModels / compareFaces, or asks about thresholds, calibration,
  model hosting, WASM hosting, fraud flags, or bring-your-own-model config for
  this package. Browser-only — not for Node/SSR.
---

# @rajeevdesai/face-verification-api

Browser-only **1:1 face verification**. Answers exactly one question: *"Is the
face in image B the same person as the face in image A?"* — fully client-side,
no biometric data leaves the browser.

It does **not** do 1:N identification/search, does not run in Node/SSR, ships no
calibrated probability, and bundles no model weights.

## Pipeline

```
decode → MediaPipe FaceLandmarker (468/478 lm) → 5 ArcFace keypoints
  → Umeyama similarity warp to 112×112 → facex_nano ONNX embedding
  → cosine distance vs threshold → optional MiniFASNet liveness ensemble → decide
```

Largest face is used per image. For the `current` image with multiple faces, the
**closest-matching** face is picked (and `multiple_faces` is flagged).

## Public API (only these two functions + types)

```typescript
import { loadModels, compareFaces, DEFAULT_THRESHOLD } from '@rajeevdesai/face-verification-api';
import type {
  CompareResult, CompareOptions, ModelConfig, FraudFlag,
  PreprocessConfig, RecognitionConfig, LivenessConfig,
  TensorLayout, ChannelOrder, DistanceMetric,
} from '@rajeevdesai/face-verification-api';
```

`DEFAULT_THRESHOLD === 0.5`. There is no other exported surface — `embed`,
`umeyama`, `detectFaces`, etc. are internal.

### `loadModels(config?: ModelConfig): Promise<void>`

Call **once** at startup, **client-side only**. Loads + caches FaceLandmarker,
recognition, and (optionally) liveness models as module singletons. Idempotent —
repeat calls are no-ops once loaded. Must run before `compareFaces` or
`compareFaces` throws `Models not loaded. Call loadModels() first.`

```typescript
await loadModels({
  faceLandmarkerPath: '/models/face_landmarker.task',     // default: models/face_landmarker.task
  recognitionModelPath: '/models/mobilefacenet.onnx',     // default: models/mobilefacenet.onnx (facex_nano weights)
  livenessModelPath: ['/models/minifasnet_v2.onnx', '/models/minifasnet_v1se.onnx'], // omit to DISABLE liveness
  liveness: [{ cropScale: 2.7 }, { cropScale: 4.0 }],     // parallel to the array above
  // wasmBasePath: '/wasm/',  // only if ort/MediaPipe .wasm aren't reachable on the jsDelivr CDN default
  // warmup: true,            // default true — dummy inference to kill first-call latency
  // recognition: { ... },    // BYO recognition model preprocessing/metric overrides
});
```

`ModelConfig` fields: `faceLandmarkerPath?`, `recognitionModelPath?`,
`livenessModelPath?: string | string[]`, `wasmBasePath?`, `warmup?` (default
true), `recognition?: RecognitionConfig`, `liveness?: LivenessConfig | LivenessConfig[]`.

- **Single liveness model:** pass a string for `livenessModelPath`.
- **Ensemble:** pass an array — live scores are **averaged**. `liveness` as an
  array applies per-model by index; a single object applies to all; omitted uses
  defaults.
- **No liveness:** omit `livenessModelPath` entirely.

### `compareFaces(baseline, current, options?): Promise<CompareResult>`

```typescript
const result = await compareFaces(baselineImg, currentImg, {
  threshold: 0.5,          // distance cutoff (configured metric, default cosine). Lower = stricter. UNCALIBRATED.
  livenessThreshold: 0.5,  // liveness score must meet this to pass. UNCALIBRATED.
  checkLiveness: undefined,// default: true iff a liveness model is loaded. true with no model loaded → throws.
});
```

Each image is `HTMLImageElement | ImageData | string`. Safe string sources:
`data:` URLs, `blob:` URLs (`URL.createObjectURL(file)`), same-origin URLs,
CORS-enabled cross-origin URLs. **Cross-origin non-CORS URLs fail** — use
`data:`/`blob:` for `<input type="file">`. Unsupported schemes (`file:`,
`javascript:`, …) throw before any fetch.

`baseline` = reference identity (ID photo / enrollment frame). `current` = image
being verified.

### `CompareResult`

```typescript
interface CompareResult {
  match: boolean;          // requires distance ≤ threshold AND liveness pass (if run)
  confidence: number;      // 0–1, = max(0, 1 - distance/threshold). NOT a calibrated probability.
  flags: FraudFlag[];
  details: {
    baselineFacesFound: number;
    currentFacesFound: number;
    distance: number;      // ← note the name: `distance`, NOT `cosineDistance`. Lower = more similar.
    threshold: number;
    livenessScore?: number;// 0–1; present ONLY when the liveness check actually ran
  };
}
```

### `FraudFlag` — branch on these

| Flag | Meaning | Effect on `match` |
|------|---------|-------------------|
| `baseline_missing` | 0 faces in baseline | forced false (early exit) |
| `baseline_ambiguous` | >1 face in baseline | largest used; continues |
| `face_missing` | 0 faces in current | forced false (early exit) |
| `multiple_faces` | >1 face in current | best match used; weakens anti-fraud |
| `identity_mismatch` | distance > threshold | false |
| `low_confidence` | matched, distance in grey zone (80–100% of threshold) | still true |
| `liveness_fail` | liveness score < livenessThreshold | forced false |

## Install

```bash
npm install @rajeevdesai/face-verification-api
npm install onnxruntime-web @mediapipe/tasks-vision   # peer deps: ort >=1.17.0, tasks-vision >=0.10.0
# weights NOT bundled — download straight into your served static dir:
npx @rajeevdesai/face-verification-api download public/models
```

The downloader (a `bin` shipped in the package, also `npm run download` from a
clone) fetches four Apache-2.0 files into the dir you pass (default
`public/models`): `face_landmarker.task`, `mobilefacenet.onnx` (facex_nano,
256-D), `minifasnet_v2.onnx` (crop 2.7), `minifasnet_v1se.onnx` (crop 4.0,
ensemble 2nd model). Write them where your app serves static assets — never into
`node_modules`. `loadModels` also accepts absolute URLs if you host on a CDN.

**Serve the models over HTTP** so the browser can fetch them at runtime:
- Vite / CRA / Next.js: put the files in `public/models/` → served at `/models/...`.
- Custom host/CDN: upload anywhere reachable, pass absolute URLs to `loadModels`.

**WASM:** MediaPipe + onnxruntime-web `.wasm` load from jsDelivr CDN by default —
usually nothing to do. To self-host (air-gapped / strict CSP / CDN blocked),
serve the `.wasm` files and set `wasmBasePath` (applied to both).

## Critical gotchas — do not relitigate

- **Browser-only.** Needs `createImageBitmap`, `OffscreenCanvas`, WASM. Never
  call `loadModels` during server render — guard with a client-side effect.
- **Load once.** Singletons; first `loadModels` does the work, rest are no-ops.
- **`details.distance`**, not `cosineDistance` — older drafts used the latter.
- **No COOP/COEP needed.** Inference is single-threaded (`numThreads = 1`) by
  design; cross-origin isolation headers are not required.
- **Thresholds are uncalibrated placeholders (0.5).** Calibrate on your own data
  before production; recalibrate when you swap the recognition model (distances
  aren't comparable across models). See Calibration below.
- **Liveness is not a sole auth factor.** The ensemble reliably rejects
  screen/video **replay**, but **print** is the hard case and can occasionally
  false-accept. Pair with another factor for anything security-critical.
- **Liveness preprocessing convention (don't "fix" it):** bundled MiniFASNet
  expects raw **[0,255] BGR** (mean 0, std 1), **live = class index 1**, index 2
  = replay. At [0,1] the export degenerates (collapses every input to one
  class). Do **not** revert to [0,1] or index 2.

## Bring your own model (no fork needed)

Both models are swappable; override only the differing preprocessing fields.

```typescript
await loadModels({
  recognitionModelPath: '/models/my-arcface.onnx',
  recognition: {              // RecognitionConfig — defaults shown (facex_nano)
    inputSize: 112,           // square input side; any size works (crop is rescaled)
    layout: 'NCHW',           // 'NCHW' | 'NHWC'
    channelOrder: 'RGB',      // 'RGB' | 'BGR'  (mean/std follow this order)
    mean: 127.5,              // scalar or [r,g,b]; value = (pixel - mean) / std, pixels in [0,255]
    std: 127.5,               // → [-1,1]
    l2normalize: true,
    metric: 'cosine',         // 'cosine' | 'euclidean'
  },
  livenessModelPath: '/models/my-liveness.onnx',
  liveness: {                 // LivenessConfig — defaults shown (MiniFASNetV2)
    inputSize: 80, layout: 'NCHW', channelOrder: 'BGR', mean: 0, std: 1, // raw [0,255]; std 255 → [0,1]
    cropScale: 2.7,           // face-crop expansion factor
    liveClassIndex: 1,        // index of the "live" class in the output
    applySoftmax: true,       // false if the model already outputs probabilities
  },
});
```

**Defaults:**

| | Recognition (facex_nano) | Liveness (MiniFASNetV2) |
|---|---|---|
| inputSize | 112 | 80 |
| layout | NCHW | NCHW |
| channelOrder | RGB | BGR |
| mean / std | 127.5 / 127.5 → `[-1,1]` | 0 / 1 → raw `[0,255]` |
| other | `l2normalize` true, `metric` cosine | `cropScale` 2.7, `liveClassIndex` 1, `applySoftmax` true |

`inputSize` is validated to an integer in `[1, 8192]`. If same-person distances
look wrong after swapping a model, the culprit is almost always `channelOrder`,
`layout`, or `mean`/`std`.

## Calibration

The default `threshold` (0.5 cosine) sits near common ArcFace LFW operating
points (~0.4–0.5) but is **not** tuned for your model/conditions/population.
Calibrate before production:

- The repo ships `demo/calibrate.html` (run `npm run demo`, open it). Point it at
  a `identity/image.jpg` folder layout; it builds same/different pairs and reports
  the **EER threshold** + best-accuracy threshold with FAR/FRR. Set `threshold`
  near EER, then bias lower (stricter, fewer false accepts) or higher (looser).
- `livenessThreshold` can't be calibrated from stored photos — it needs **live
  captures vs spoof attempts** (print/replay).

> **Use data you have the right to use.** A face used for identification is
> biometric personal data (GDPR Art. 9, Illinois BIPA, etc.). Calibrate on
> consented / self-collected / CC0 images — **never scraped datasets** (LFW,
> VGGFace2, CelebA, … are research-only/scraped and not appropriate for tuning a
> shipped product). A single global threshold can't equalize error across
> demographics — audit per-group if fairness matters.

## React / framework sketch

```tsx
useEffect(() => {
  loadModels({
    faceLandmarkerPath: '/models/face_landmarker.task',
    recognitionModelPath: '/models/mobilefacenet.onnx',
    livenessModelPath: ['/models/minifasnet_v2.onnx', '/models/minifasnet_v1se.onnx'],
    liveness: [{ cropScale: 2.7 }, { cropScale: 4.0 }],
  }).catch(console.error);
}, []);

async function onVerify(idPhoto: string, selfie: File) {
  const result = await compareFaces(idPhoto, URL.createObjectURL(selfie));
  if (result.flags.includes('liveness_fail')) { /* spoof suspected */ }
  if (result.flags.includes('face_missing')) { /* ask for a clearer photo */ }
  return result.match; // true only if identity AND liveness both pass
}
```

## Common errors → fix

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Models not loaded. Call loadModels() first.` | `compareFaces` ran before/without `loadModels` | await `loadModels` once at startup |
| WASM-not-found rejection from `loadModels` | `.wasm` blobs unreachable (CDN blocked / offline) | self-host `.wasm`, set `wasmBasePath` |
| `checkLiveness:true but no liveness model is loaded.` | forced liveness with no model | pass `livenessModelPath`, or drop `checkLiveness:true` |
| `Unsupported image source scheme "...:"` | passed `file:`/`javascript:`/other scheme | use `data:`/`blob:`/same-origin/CORS URL |
| `Failed to fetch image: <status>` | bad URL or cross-origin non-CORS | use `data:`/`blob:` for file inputs |
| Same person reads as mismatch after BYO swap | wrong preprocessing | check `channelOrder` / `layout` / `mean` / `std`; recalibrate `threshold` |
| Runs in Node/SSR and crashes | browser-only APIs missing | call only client-side |

## Accuracy & licensing

facex_nano ≈ 95.62% on LFW; harder in-the-wild captures (pose, lighting,
occlusion) do worse — design for some error. Library code is MIT; model weights
are Apache-2.0 and **not bundled** (downloaded via the `npx` downloader above).
Consumers are responsible for model-license compliance.
