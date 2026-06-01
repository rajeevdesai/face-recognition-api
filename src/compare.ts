/**
 * compareFaces — top-level 1:1 face verification.
 *
 * Per call, the pipeline:
 *   1. Decodes both inputs to ImageData             (image.ts)
 *   2. Detects + landmarks every face               (detect.ts)
 *   3. Aligns each face to the ArcFace template      (align.ts)
 *   4. Embeds and compares by the configured metric  (embed.ts)
 *   5. Optionally scores liveness on the best match  (liveness.ts)
 *
 * Returns a structured {@link CompareResult}: a boolean match, a
 * (non-probabilistic) confidence, and {@link FraudFlag}s for the caller to act
 * on. Models must be loaded once via loadModels() before any call.
 */
import type { CompareOptions, CompareResult, FraudFlag } from './types.js';
import { toImageData } from './image.js';
import { detectFaces } from './detect.js';
import { extractFivePoints, warpFace } from './align.js';
import { embed, distance } from './embed.js';
import { cropForLiveness, scoreLiveness } from './liveness.js';
import { getModels } from './models.js';

/**
 * Uncalibrated default threshold (cosine distance).
 *
 * 0.5 is a conservative starting point; tune against your own same/different image set
 * before production use. Lower = stricter. Common ArcFace LFW thresholds: ~0.4–0.5.
 */
export const DEFAULT_THRESHOLD = 0.5;

/** Low-confidence grey zone: distance in (LOW_CONF_RATIO * threshold, threshold]. */
const LOW_CONF_RATIO = 0.8;

/**
 * Build a non-matching result for the early-exit cases where one side has no
 * detectable face. distance is reported as 1 (maximum dissimilarity) because no
 * embedding comparison was performed.
 */
function noMatchResult(
  flags: FraudFlag[],
  baselineFacesFound: number,
  currentFacesFound: number,
  threshold: number,
): CompareResult {
  return {
    match: false,
    confidence: 0,
    flags,
    details: { baselineFacesFound, currentFacesFound, distance: 1, threshold },
  };
}

/**
 * Compare two face images and return a structured match result.
 *
 * @param baseline - Reference identity (ID photo, enrollment frame, etc.)
 * @param current  - Image to verify
 */
export async function compareFaces(
  baseline: HTMLImageElement | ImageData | string,
  current: HTMLImageElement | ImageData | string,
  options: CompareOptions = {},
): Promise<CompareResult> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const livenessThreshold = options.livenessThreshold ?? 0.5;
  const { faceLandmarker, session, livenessSessions, recognitionConfig, livenessConfigs } =
    getModels();

  // Liveness runs by default when at least one model is loaded. Explicitly
  // requesting it without a loaded model is a configuration error.
  if (options.checkLiveness === true && livenessSessions.length === 0) {
    throw new Error(
      'checkLiveness:true but no liveness model is loaded. Pass livenessModelPath to loadModels().',
    );
  }
  const runLiveness = options.checkLiveness ?? livenessSessions.length > 0;

  const [baselineData, currentData] = await Promise.all([
    toImageData(baseline),
    toImageData(current),
  ]);

  const baselineFaces = detectFaces(faceLandmarker, baselineData);
  const currentFaces = detectFaces(faceLandmarker, currentData);

  const flags: FraudFlag[] = [];

  // --- Baseline face selection ---
  if (baselineFaces.length === 0) {
    flags.push('baseline_missing');
    return noMatchResult(flags, 0, currentFaces.length, threshold);
  }
  if (baselineFaces.length > 1) flags.push('baseline_ambiguous');
  // Use largest face (faces already sorted largest-first by detectFaces)
  const baselineFace = baselineFaces[0];

  // --- Current face selection ---
  if (currentFaces.length === 0) {
    flags.push('face_missing');
    return noMatchResult(flags, baselineFaces.length, 0, threshold);
  }
  if (currentFaces.length > 1) {
    // Documented behavior: uses best match, which weakens fraud detection.
    // Flagged explicitly so callers can decide how to handle it.
    flags.push('multiple_faces');
  }

  // --- Embed baseline ---
  const baselinePts = extractFivePoints(
    baselineFace.landmarks,
    baselineData.width,
    baselineData.height,
  );
  const baselineCrop = warpFace(baselineData, baselinePts, recognitionConfig.inputSize);
  const baselineEmb = await embed(session, baselineCrop, recognitionConfig);

  // --- Embed all current faces, pick closest match ---
  let bestDistance = Infinity;
  let bestFaceLandmarks = currentFaces[0].landmarks;
  for (const face of currentFaces) {
    const pts = extractFivePoints(face.landmarks, currentData.width, currentData.height);
    const crop = warpFace(currentData, pts, recognitionConfig.inputSize);
    const emb = await embed(session, crop, recognitionConfig);
    const dist = distance(baselineEmb, emb, recognitionConfig.metric);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestFaceLandmarks = face.landmarks;
    }
  }

  // --- Liveness check on best-match face ---
  // Ensemble: each model gets its own crop (scale) + config; the live scores are
  // averaged. A single model is just an average of one.
  let livenessScore: number | undefined;
  if (runLiveness && livenessSessions.length > 0) {
    let sum = 0;
    for (let k = 0; k < livenessSessions.length; k++) {
      const cfg = livenessConfigs[k];
      const crop = cropForLiveness(currentData, bestFaceLandmarks, cfg.cropScale, cfg.inputSize);
      sum += await scoreLiveness(livenessSessions[k], crop, cfg);
    }
    livenessScore = sum / livenessSessions.length;
    if (livenessScore < livenessThreshold) flags.push('liveness_fail');
  }

  // --- Decide match + emit fraud flags ---
  // A match requires BOTH identity (distance within threshold) and liveness.
  // Liveness passes if it was skipped, or if its score met the threshold.
  const livenessPass =
    !runLiveness || (livenessScore !== undefined && livenessScore >= livenessThreshold);
  const match = bestDistance <= threshold && livenessPass;

  if (bestDistance > threshold) flags.push('identity_mismatch');
  // Grey zone: matched, but distance sits close to the threshold
  // (LOW_CONF_RATIO–100% of it) — surface as a soft warning.
  if (match && bestDistance > LOW_CONF_RATIO * threshold) flags.push('low_confidence');

  // Confidence = how far below the threshold we landed (1 at distance 0, 0 at
  // the threshold). NOT a calibrated probability — see README.
  const confidence = Math.max(0, 1 - bestDistance / threshold);

  return {
    match,
    confidence,
    flags,
    details: {
      baselineFacesFound: baselineFaces.length,
      currentFacesFound: currentFaces.length,
      distance: bestDistance,
      threshold,
      livenessScore,
    },
  };
}
