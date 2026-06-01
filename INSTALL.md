# Installation Guide

Step-by-step setup for adding `@rajeevdesai/face-recognition` to a browser app.

> This library is **browser-only**. It needs `createImageBitmap`, `OffscreenCanvas`, and WebAssembly. It will not run under Node or server-side rendering.

## 1. Prerequisites

- A bundler / dev server that serves a browser app (Vite, Next.js, CRA, etc.).
- The two peer dependencies installed in your app.
- A way to serve static files (the model weights and, optionally, the WASM blobs).

## 2. Install packages

```bash
npm install @rajeevdesai/face-recognition
npm install onnxruntime-web @mediapipe/tasks-vision   # peer deps
```

The peer-dependency versions are intentionally loose (`onnxruntime-web >=1.17.0`, `@mediapipe/tasks-vision >=0.10.0`). If your app already uses these, no extra install is needed.

## 3. Download the model weights

Weights are **not** bundled (license + size). Download them into `models/`:

```bash
bash models/download.sh
```

This fetches three files:

| File | Model | License |
|------|-------|---------|
| `face_landmarker.task` | MediaPipe FaceLandmarker | Apache-2.0 |
| `mobilefacenet.onnx` | facex_nano (256-D embedding) | Apache-2.0 |
| `minifasnet_v2.onnx` | MiniFASNetV2 liveness | Apache-2.0 |

> Review [Open Risks](./README.md#open-risks) #1 before relying on the recognition model in production.

## 4. Serve the models

The browser fetches the model files at runtime, so they must be reachable over HTTP from your app.

- **Vite / CRA:** copy the three files into `public/models/`. They will be served at `/models/...`.
- **Next.js:** place them under `public/models/`. Same `/models/...` paths.
- **Custom static host / CDN:** upload them anywhere reachable and pass absolute URLs to `loadModels`.

Then point `loadModels` at wherever you served them:

```typescript
await loadModels({
  faceLandmarkerPath: '/models/face_landmarker.task',
  recognitionModelPath: '/models/mobilefacenet.onnx',
  livenessModelPath: '/models/minifasnet_v2.onnx',
});
```

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
import { loadModels, compareFaces } from '@rajeevdesai/face-recognition';

await loadModels({
  faceLandmarkerPath: '/models/face_landmarker.task',
  recognitionModelPath: '/models/mobilefacenet.onnx',
  livenessModelPath: '/models/minifasnet_v2.onnx',
});

const result = await compareFaces(imgA, imgB);
console.log(result);
```

If `loadModels` rejects with a WASM-not-found error, the `.wasm` blobs aren't reachable — set `wasmBasePath` (step 5).

## 7. Before production

Calibrate `threshold` and `livenessThreshold` on your own data — the defaults are placeholders. See [Threshold & calibration](./README.md#threshold--calibration).
