/** Public types for the face-verification-api: results, options, flags, config. */

export type FraudFlag =
  | 'baseline_missing'
  | 'baseline_ambiguous'
  | 'face_missing'
  | 'multiple_faces'
  | 'identity_mismatch'
  | 'low_confidence'
  | 'liveness_fail';

export interface CompareResult {
  match: boolean;
  /** 0–1; margin below threshold. NOT a calibrated probability. */
  confidence: number;
  flags: FraudFlag[];
  details: {
    baselineFacesFound: number;
    currentFacesFound: number;
    /** Embedding distance under the configured metric (default cosine). Lower = more similar. */
    distance: number;
    threshold: number;
    /** Liveness score [0–1] for the current image. Absent if liveness model not loaded or check skipped. */
    livenessScore?: number;
  };
}

export interface CompareOptions {
  /** Distance threshold (configured metric, default cosine). Default: 0.5 (uncalibrated — run calibration before production use). */
  threshold?: number;
  /** Liveness score threshold for the current image. Score must meet this to pass. Default: 0.5. */
  livenessThreshold?: number;
  /**
   * Whether to run liveness check on the current image. Default: true if a liveness model is loaded,
   * false otherwise. Setting it true with no liveness model loaded throws.
   */
  checkLiveness?: boolean;
}

// ---- Bring-your-own-model configuration -----------------------------------

export type TensorLayout = 'NCHW' | 'NHWC';
export type ChannelOrder = 'RGB' | 'BGR';
export type DistanceMetric = 'cosine' | 'euclidean';

/**
 * Image→tensor preprocessing for a model. The aligned crop's pixels are mapped
 * as `value = (pixel - mean) / std`, per channel position in `channelOrder`.
 * `mean`/`std` accept a scalar (applied to all channels) or a per-channel triplet.
 */
export interface PreprocessConfig {
  /** Square model input side in pixels. */
  inputSize?: number;
  /** Tensor element layout. */
  layout?: TensorLayout;
  /** Channel order the model expects. mean/std follow this order. */
  channelOrder?: ChannelOrder;
  /** Per-channel mean to subtract (pixels are in [0,255]). */
  mean?: number | [number, number, number];
  /** Per-channel divisor. */
  std?: number | [number, number, number];
}

/**
 * Recognition (embedding) model config. Defaults match the bundled facex_nano:
 * inputSize 112, NCHW, RGB, mean 127.5, std 127.5 ([-1,1]), L2-normalized, cosine.
 */
export interface RecognitionConfig extends PreprocessConfig {
  /** L2-normalize the embedding before distance. Default: true. */
  l2normalize?: boolean;
  /** Distance metric. Default: 'cosine'. */
  metric?: DistanceMetric;
}

/**
 * Liveness (anti-spoofing) model config. Defaults match the bundled MiniFASNetV2:
 * inputSize 80, NCHW, BGR, mean 0, std 1 (raw [0,255]), cropScale 2.7,
 * liveClassIndex 1, softmax applied.
 */
export interface LivenessConfig extends PreprocessConfig {
  /** Expansion factor for the face crop fed to the model. Default: 2.7. */
  cropScale?: number;
  /** Index of the "live" class in the model output. Default: 1. */
  liveClassIndex?: number;
  /** Softmax the output before reading liveClassIndex. Set false if the model already outputs probabilities. Default: true. */
  applySoftmax?: boolean;
}

export interface ModelConfig {
  /** Path or URL to face_landmarker.task (MediaPipe). */
  faceLandmarkerPath?: string;
  /** Path or URL to the recognition ONNX model (default: facex_nano-compatible). */
  recognitionModelPath?: string;
  /**
   * Path(s) to the liveness ONNX model(s). Omit to disable liveness entirely.
   * Pass an array to ensemble multiple models — their live scores are averaged
   * (the default setup pairs MiniFASNetV2 @2.7 with MiniFASNetV1SE @4.0).
   */
  livenessModelPath?: string | string[];
  /** Base URL/path for WASM blobs (MediaPipe + onnxruntime-web). */
  wasmBasePath?: string;
  /** Run a dummy inference after load to avoid first-call latency. Default: true. */
  warmup?: boolean;
  /** Preprocessing/metric overrides for a bring-your-own recognition model. */
  recognition?: RecognitionConfig;
  /**
   * Preprocessing/class overrides for the liveness model(s). Pass an array
   * (parallel to livenessModelPath) for per-model config in an ensemble; a single
   * object is applied to every model.
   */
  liveness?: LivenessConfig | LivenessConfig[];
}
