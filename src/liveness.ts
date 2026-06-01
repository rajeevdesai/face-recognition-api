/**
 * Passive liveness / anti-spoofing via MiniFASNetV2 (Silent-Face).
 *
 * Crops an expanded region around the face, runs the 80×80 anti-spoofing model,
 * and returns a single liveness probability in [0, 1].
 *
 * LIMITATIONS (see README → Open Risks):
 *   - Screen/video replay is reliably rejected (scores the replay class).
 *   - PRINT attacks are detected UNRELIABLY: a print can leak into the live
 *     class and false-accept. Mitigation: add MiniFASNetV1SE (4.0 crop) and
 *     ensemble, as upstream minivision does. Tracked as an Open Risk.
 */
import * as ort from 'onnxruntime-web';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const INPUT_SIZE = 80;

/**
 * Silent-Face Anti-Spoofing crop: expanded bounding box around face landmarks.
 *
 * Scale factor 2.7 matches MiniFASNetV2 training crop. The model needs context
 * beyond the tight face region to detect texture/reflection artifacts.
 */
export function cropForLiveness(
  source: ImageData,
  landmarks: NormalizedLandmark[],
  scale = 2.7,
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

  // Crop then resize to INPUT_SIZE×INPUT_SIZE
  const srcCanvas = new OffscreenCanvas(width, height);
  (srcCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(source, 0, 0);

  const out = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const ctx = out.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(srcCanvas, x0, y0, cropW, cropH, 0, 0, INPUT_SIZE, INPUT_SIZE);

  return ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
}

/**
 * NCHW Float32, BGR, raw pixel values in [0, 255].
 *
 * NOTE: this garciafido ONNX export expects [0,255], NOT the [0,1] that the
 * minivision ToTensor pipeline produces. At [0,1] the model is degenerate —
 * it collapses to one class (~0.99) for ALL inputs, including high-texture
 * noise — so it cannot separate live from spoof. Feeding [0,255] restores
 * discrimination. (Channel order BGR matches minivision's cv2 source.)
 */
function preprocess(crop: ImageData): Float32Array {
  const { data } = crop;
  const size = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * size);

  // Aligned channel writes — keep the column layout.
  // prettier-ignore
  for (let i = 0; i < size; i++) {
    tensor[i]          = data[i * 4 + 2]; // B
    tensor[size + i]   = data[i * 4 + 1]; // G
    tensor[size*2 + i] = data[i * 4];     // R
  }

  return tensor;
}

/**
 * Run MiniFASNetV2 inference on an 80×80 crop.
 *
 * The model emits 3-class logits; we softmax them and return the live-class
 * probability. Class mapping (minivision convention; confirmed empirically with
 * live / phone-replay / print captures):
 *   index 0 — spoof (not clearly elicited in testing)
 *   index 1 — LIVE / real face  ← returned
 *   index 2 — spoof, screen/video replay (a print can also land here)
 *
 * The earlier "index 2 = live" reading was an artifact of feeding [0,1] input,
 * which collapses EVERY input to index 2 (~0.99). The fix is in preprocess():
 * this export expects [0,255]. The model card's index-0 claim is also wrong.
 */
export async function scoreLiveness(
  session: ort.InferenceSession,
  crop: ImageData,
): Promise<number> {
  const input = preprocess(crop);
  const inputName = session.inputNames[0];
  const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const outputs = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  const data = outputs[outputName].data as Float32Array;

  // Logits → softmax; live is class 1 (minivision convention: label 1 = real).
  const e = Array.from(data).map(Math.exp);
  const sum = e[0] + e[1] + e[2];
  return e[1] / sum;
}
