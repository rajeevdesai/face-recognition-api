# Installation Guide

Step-by-step setup for adding `@rajeevdesai/face-verification-api` to a browser app.

> This library is **browser-only**. It needs `createImageBitmap`, `OffscreenCanvas`, and WebAssembly. It will not run under Node or server-side rendering.

> 💡 **Using Claude Code?** This repo ships a Claude Code skill at [`.claude/skills/face-verification-api/SKILL.md`](./.claude/skills/face-verification-api/SKILL.md) — the full API, config, gotchas, and calibration in one file. Copy that directory into your own project's `.claude/skills/` and your Claude Code will know how to integrate this package.

## 1. Prerequisites

- A bundler / dev server that serves a browser app (Vite, Next.js, CRA, etc.).
- The two peer dependencies installed in your app.
- A way to serve static files (the model weights and, optionally, the WASM blobs).

## 2. Install packages

```bash
npm install @rajeevdesai/face-verification-api
npm install onnxruntime-web @mediapipe/tasks-vision   # peer deps
```

The peer-dependency versions are intentionally loose (`onnxruntime-web >=1.17.0`, `@mediapipe/tasks-vision >=0.10.0`). If your app already uses these, no extra install is needed.

## 3. Download the model weights

Weights are **not** bundled (license + size). The package ships a downloader that
fetches them straight into a directory you choose — point it at wherever you
serve static assets (see step 4), e.g. `public/models`:

```bash
npx @rajeevdesai/face-verification-api download public/models
```

> Cloning the repo instead of installing from npm? Run `npm run download -- public/models`
> (same script). Defaults to `public/models` if you omit the directory.

This fetches four files:

| File | Model | License |
|------|-------|---------|
| `face_landmarker.task` | MediaPipe FaceLandmarker | Apache-2.0 |
| `mobilefacenet.onnx` | facex_nano (256-D embedding) | Apache-2.0 |
| `minifasnet_v2.onnx` | MiniFASNetV2 liveness (crop 2.7) | Apache-2.0 |
| `minifasnet_v1se.onnx` | MiniFASNetV1SE liveness (crop 4.0, ensemble 2nd model) | Apache-2.0 |

> Review the [Open Risks](./README.md#open-risks) (uncalibrated thresholds, liveness print limits) before relying on this in production.

## 4. Serve the models

The browser fetches the model files at runtime, so they must be reachable over HTTP from your app. The downloader in step 3 already writes into your served directory — just point it at the right place:

- **Vite / CRA:** `npx @rajeevdesai/face-verification-api download public/models` → served at `/models/...`.
- **Next.js:** same — `public/models/`, served at `/models/...`.
- **Custom static host / CDN:** download to any directory, upload it anywhere reachable, and pass absolute URLs to `loadModels`.

Then point `loadModels` at wherever you served them:

```typescript
await loadModels({
  faceLandmarkerPath: '/models/face_landmarker.task',
  recognitionModelPath: '/models/mobilefacenet.onnx',
  livenessModelPath: ['/models/minifasnet_v2.onnx', '/models/minifasnet_v1se.onnx'],
  liveness: [{ cropScale: 2.7 }, { cropScale: 4.0 }],
});
```

> `livenessModelPath` is optional — omit it to disable liveness. To use a model that
> isn't the bundled default (different input size, channel order, normalization,
> metric, …), pass `recognition` / `liveness` config — see
> [Bring your own model](./README.md#bring-your-own-model).

## 5. WASM hosting (usually nothing to do)

By default the MediaPipe and onnxruntime-web `.wasm` blobs are loaded from the jsDelivr CDN — no setup required.

To self-host (air-gapped, strict CSP, or CDN blocked), serve the `.wasm` files yourself and set:

```typescript
await loadModels({ /* ...model paths... */, wasmBasePath: '/wasm/' });
```

`wasmBasePath` is applied to both MediaPipe and onnxruntime-web.

### Cross-origin isolation

Inference runs single-threaded (`numThreads = 1`), so you do **not** need `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers. This is deliberate — it keeps deployment simple at the cost of multi-threaded speed.

## 6. Verify the setup

```typescript
import { loadModels, compareFaces } from '@rajeevdesai/face-verification-api';

await loadModels({
  faceLandmarkerPath: '/models/face_landmarker.task',
  recognitionModelPath: '/models/mobilefacenet.onnx',
  livenessModelPath: ['/models/minifasnet_v2.onnx', '/models/minifasnet_v1se.onnx'],
  liveness: [{ cropScale: 2.7 }, { cropScale: 4.0 }],
});

const result = await compareFaces(imgA, imgB);
console.log(result);
```

If `loadModels` rejects with a WASM-not-found error, the `.wasm` blobs aren't reachable — set `wasmBasePath` (step 5).

## 7. Before production

Calibrate `threshold` and `livenessThreshold` on your own data — the defaults are placeholders. Recalibrate whenever you swap the recognition model; distances aren't comparable across models. See [Threshold & calibration](./README.md#threshold--calibration).
