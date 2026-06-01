/**
 * Model lifecycle. Lazily loads and caches the models (FaceLandmarker,
 * recognition, and zero or more liveness models) as module singletons, along
 * with their resolved preprocessing configs, and hands them to the pipeline via
 * getModels(). Call loadModels() once at startup.
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as ort from 'onnxruntime-web';
import type { ModelConfig, LivenessConfig } from './types.js';
import {
  resolveRecognitionConfig,
  RECOGNITION_DEFAULTS,
  type ResolvedRecognitionConfig,
} from './embed.js';
import { resolveLivenessConfig, type ResolvedLivenessConfig } from './liveness.js';
import { buildInputTensor, tensorDims } from './preprocess.js';

const DEFAULT_MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const DEFAULT_ORT_WASM = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/';

let faceLandmarker: FaceLandmarker | null = null;
let session: ort.InferenceSession | null = null;
let livenessSessions: ort.InferenceSession[] = [];
let recognitionConfig: ResolvedRecognitionConfig = RECOGNITION_DEFAULTS;
let livenessConfigs: ResolvedLivenessConfig[] = [];

/** Build a zeroed dummy crop for warmup at the given square size. */
function dummyCrop(size: number): ImageData {
  return { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) } as ImageData;
}

/** Normalize livenessModelPath to an array of paths. */
function toPaths(p: string | string[] | undefined): string[] {
  return p == null ? [] : Array.isArray(p) ? p : [p];
}

/** Per-model liveness config: array → by index; single object → applied to all; undefined → defaults. */
function resolveLivenessConfigs(
  paths: string[],
  liveness: LivenessConfig | LivenessConfig[] | undefined,
): ResolvedLivenessConfig[] {
  return paths.map((_, i) =>
    resolveLivenessConfig(Array.isArray(liveness) ? liveness[i] : liveness),
  );
}

/**
 * Load (or reuse) the models: FaceLandmarker, recognition, and any liveness models.
 *
 * Omit livenessModelPath to disable liveness; pass an array to ensemble. Must be
 * called before compareFaces(). Safe to call multiple times — subsequent calls are
 * no-ops if models are already loaded.
 *
 * Common failure: onnxruntime-web cannot find its .wasm blobs.
 * Set wasmBasePath to wherever ort .wasm files are served, or rely on the CDN default.
 */
export async function loadModels(config: ModelConfig = {}): Promise<void> {
  const {
    faceLandmarkerPath = 'models/face_landmarker.task',
    recognitionModelPath = 'models/mobilefacenet.onnx',
    livenessModelPath,
    wasmBasePath,
    warmup = true,
    recognition,
    liveness,
  } = config;

  const livenessPaths = toPaths(livenessModelPath);
  recognitionConfig = resolveRecognitionConfig(recognition);
  livenessConfigs = resolveLivenessConfigs(livenessPaths, liveness);

  ort.env.wasm.wasmPaths = wasmBasePath ?? DEFAULT_ORT_WASM;
  ort.env.wasm.numThreads = 1; // single-threaded — no COOP/COEP headers required

  if (!faceLandmarker) {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      wasmBasePath ?? DEFAULT_MEDIAPIPE_WASM,
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: faceLandmarkerPath, delegate: 'GPU' },
      runningMode: 'IMAGE',
      numFaces: 10,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  if (!session) {
    session = await ort.InferenceSession.create(recognitionModelPath, {
      executionProviders: ['wasm'],
    });
  }

  if (livenessSessions.length === 0 && livenessPaths.length > 0) {
    livenessSessions = await Promise.all(
      livenessPaths.map((p) => ort.InferenceSession.create(p, { executionProviders: ['wasm'] })),
    );
  }

  if (warmup) {
    const rc = recognitionConfig;
    const recInput = buildInputTensor(dummyCrop(rc.inputSize), rc);
    await session.run({
      [session.inputNames[0]]: new ort.Tensor(
        'float32',
        recInput,
        tensorDims(rc.layout, rc.inputSize),
      ),
    });

    for (let i = 0; i < livenessSessions.length; i++) {
      const lc = livenessConfigs[i];
      const livInput = buildInputTensor(dummyCrop(lc.inputSize), lc);
      await livenessSessions[i].run({
        [livenessSessions[i].inputNames[0]]: new ort.Tensor(
          'float32',
          livInput,
          tensorDims(lc.layout, lc.inputSize),
        ),
      });
    }
  }
}

export function getModels(): {
  faceLandmarker: FaceLandmarker;
  session: ort.InferenceSession;
  livenessSessions: ort.InferenceSession[];
  recognitionConfig: ResolvedRecognitionConfig;
  livenessConfigs: ResolvedLivenessConfig[];
} {
  if (!faceLandmarker || !session) {
    throw new Error('Models not loaded. Call loadModels() first.');
  }
  return { faceLandmarker, session, livenessSessions, recognitionConfig, livenessConfigs };
}

/** Reset singletons (useful in tests). */
export function _resetModels(): void {
  faceLandmarker?.close();
  faceLandmarker = null;
  session = null;
  livenessSessions = [];
  recognitionConfig = RECOGNITION_DEFAULTS;
  livenessConfigs = [];
}
