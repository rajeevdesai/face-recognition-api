/**
 * Passive liveness / anti-spoofing via MiniFASNetV2 (Silent-Face), with
 * configurable preprocessing and class index for bring-your-own models.
 *
 * Crops an expanded region around the face, runs the anti-spoofing model, and
 * returns a single liveness probability in [0, 1].
 *
 * LIMITATIONS (see README → Open Risks):
 *   - Screen/video replay is reliably rejected (scores the replay class).
 *   - PRINT attacks are detected UNRELIABLY: a print can leak into the live
 *     class and false-accept. Mitigation: add MiniFASNetV1SE (4.0 crop) and
 *     ensemble, as upstream minivision does. Tracked as an Open Risk.
 */
import * as ort from 'onnxruntime-web';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { LivenessConfig } from './types.js';
import {
  buildInputTensor,
  tensorDims,
  triplet,
  validateInputSize,
  type ResolvedTensorSpec,
} from './preprocess.js';

export interface ResolvedLivenessConfig extends ResolvedTensorSpec {
  cropScale: number;
  liveClassIndex: number;
  applySoftmax: boolean;
}

/**
 * Defaults for the bundled MiniFASNetV2 (garciafido export).
 *
 * NOTE: this export expects raw [0,255] BGR (mean 0, std 1), NOT the [0,1] that
 * the minivision ToTensor pipeline produces — at [0,1] it is degenerate,
 * collapsing every input to one class. Live is index 1 (minivision convention:
 * label 1 = real); index 2 is screen/video replay.
 */
export const LIVENESS_DEFAULTS: ResolvedLivenessConfig = {
  inputSize: 80,
  layout: 'NCHW',
  channelOrder: 'BGR',
  mean: [0, 0, 0],
  std: [1, 1, 1],
  cropScale: 2.7,
  liveClassIndex: 1,
  applySoftmax: true,
};

/** Merge a user LivenessConfig over the defaults. */
export function resolveLivenessConfig(c: LivenessConfig = {}): ResolvedLivenessConfig {
  return {
    inputSize: validateInputSize(c.inputSize ?? LIVENESS_DEFAULTS.inputSize),
    layout: c.layout ?? LIVENESS_DEFAULTS.layout,
    channelOrder: c.channelOrder ?? LIVENESS_DEFAULTS.channelOrder,
    mean: c.mean !== undefined ? triplet(c.mean) : LIVENESS_DEFAULTS.mean,
    std: c.std !== undefined ? triplet(c.std) : LIVENESS_DEFAULTS.std,
    cropScale: c.cropScale ?? LIVENESS_DEFAULTS.cropScale,
    liveClassIndex: c.liveClassIndex ?? LIVENESS_DEFAULTS.liveClassIndex,
    applySoftmax: c.applySoftmax ?? LIVENESS_DEFAULTS.applySoftmax,
  };
}

/**
 * Silent-Face crop: an expanded square bounding box around the face landmarks,
 * resized to inputSize². The model needs context beyond the tight face region
 * to detect texture/reflection artifacts; scale 2.7 matches MiniFASNetV2 training.
 */
/* v8 ignore start */
// Browser-only (OffscreenCanvas); not executable under Node unit tests.
export function cropForLiveness(
  source: ImageData,
  landmarks: NormalizedLandmark[],
  scale = LIVENESS_DEFAULTS.cropScale,
  inputSize = LIVENESS_DEFAULTS.inputSize,
): ImageData {
  const { width, height } = source;

  // Bounding box from normalized landmarks → pixel space
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.y > maxY) maxY = lm.y;
  }

  const faceW = (maxX - minX) * width;
  const faceH = (maxY - minY) * height;
  const cx = ((minX + maxX) / 2) * width;
  const cy = ((minY + maxY) / 2) * height;

  // Expand to a square, then scale
  const side = Math.max(faceW, faceH) * scale;
  const halfSide = side / 2;

  const x0 = Math.round(Math.max(0, cx - halfSide));
  const y0 = Math.round(Math.max(0, cy - halfSide));
  const x1 = Math.round(Math.min(width, cx + halfSide));
  const y1 = Math.round(Math.min(height, cy + halfSide));

  const cropW = x1 - x0;
  const cropH = y1 - y0;

  // Crop then resize to inputSize×inputSize
  const srcCanvas = new OffscreenCanvas(width, height);
  (srcCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(source, 0, 0);

  const out = new OffscreenCanvas(inputSize, inputSize);
  const ctx = out.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(srcCanvas, x0, y0, cropW, cropH, 0, 0, inputSize, inputSize);

  return ctx.getImageData(0, 0, inputSize, inputSize);
}
/* v8 ignore stop */

/**
 * Run the liveness model on a crop and return the live-class probability.
 *
 * Output is softmaxed (unless cfg.applySoftmax is false) and cfg.liveClassIndex
 * is returned. See LIVENESS_DEFAULTS for the bundled model's class mapping.
 */
export async function scoreLiveness(
  session: ort.InferenceSession,
  crop: ImageData,
  cfg: ResolvedLivenessConfig = LIVENESS_DEFAULTS,
): Promise<number> {
  const input = buildInputTensor(crop, cfg);
  const inputName = session.inputNames[0];
  const tensor = new ort.Tensor('float32', input, tensorDims(cfg.layout, cfg.inputSize));
  const outputs = await session.run({ [inputName]: tensor });
  const data = Array.from(outputs[session.outputNames[0]].data as Float32Array);

  if (!cfg.applySoftmax) return data[cfg.liveClassIndex];

  // Numerically stable softmax over all output classes.
  const max = Math.max(...data);
  const exps = data.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps[cfg.liveClassIndex] / sum;
}
