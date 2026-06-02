/**
 * Geometric face alignment. Extracts five ArcFace keypoints from MediaPipe
 * landmarks and computes the Umeyama similarity transform (least-squares
 * rotation + uniform scale + translation) that warps a face into the canonical
 * 112×112 ArcFace pose expected by the embedding model.
 */
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/** ArcFace standard destination template (112×112). Order: [left_eye, right_eye, nose, left_mouth, right_mouth]. */
export const ARCFACE_DST: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

/**
 * Extract 5 ArcFace keypoints from MediaPipe FaceLandmarker output.
 *
 * Returns pixel-space coords [left_eye, right_eye, nose, left_mouth, right_mouth].
 * Landmarks are normalized [0,1]; multiply by image dimensions here.
 *
 * Iris indices (478-landmark model): 468 = left iris center, 473 = right iris center.
 * Eye-corner fallback (468-landmark model): left eye 33/133, right eye 263/362.
 * Indices 1, 61, 291 are stable across both model variants.
 *
 * Verified 2026-06-02 against the float16 face_landmarker.task: detect emits 478
 * landmarks, and these five points fit ARCFACE_DST at ~1-2px RMS — i.e. the
 * image-side pairing is correct, with no left/right swap. (468 lands at image-left,
 * matching ARCFACE_DST[0]; 473 at image-right.)
 */
export function extractFivePoints(
  landmarks: NormalizedLandmark[],
  imageWidth: number,
  imageHeight: number,
): [number, number][] {
  const px = (lm: NormalizedLandmark): [number, number] => [lm.x * imageWidth, lm.y * imageHeight];

  const hasIris = landmarks.length >= 478;

  // Left eye center
  const leftEye: [number, number] = hasIris
    ? px(landmarks[468])
    : midpoint(px(landmarks[33]), px(landmarks[133]));

  // Right eye center
  const rightEye: [number, number] = hasIris
    ? px(landmarks[473])
    : midpoint(px(landmarks[263]), px(landmarks[362]));

  const nose: [number, number] = px(landmarks[1]);
  const leftMouth: [number, number] = px(landmarks[61]);
  const rightMouth: [number, number] = px(landmarks[291]);

  return [leftEye, rightEye, nose, leftMouth, rightMouth];
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Umeyama similarity transform: least-squares rotation + uniform scale + translation.
 * Maps src → dst.
 *
 * Returns affine coefficients [a, b, tx, d, e, ty] where:
 *   x' = a*x + b*y + tx
 *   y' = d*x + e*y + ty
 */
// Paired statements below map to vectors / 2×2 matrix rows — keep the layout.
// prettier-ignore
export function umeyama(
  src: [number, number][],
  dst: [number, number][],
): [number, number, number, number, number, number] {
  const n = src.length;

  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[i][0]; msy += src[i][1];
    mdx += dst[i][0]; mdy += dst[i][1];
  }
  msx /= n; msy /= n; mdx /= n; mdy /= n;

  // Variance of src (σ²_src)
  let sigmaSrc = 0;
  for (let i = 0; i < n; i++) {
    const dx = src[i][0] - msx, dy = src[i][1] - msy;
    sigmaSrc += dx * dx + dy * dy;
  }
  sigmaSrc /= n;

  // Covariance matrix W = (1/n) Σ (dst_c * src_c^T)
  let w00 = 0, w01 = 0, w10 = 0, w11 = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - msx, sy = src[i][1] - msy;
    const dx = dst[i][0] - mdx, dy = dst[i][1] - mdy;
    w00 += dx * sx; w01 += dx * sy;
    w10 += dy * sx; w11 += dy * sy;
  }
  w00 /= n; w01 /= n; w10 /= n; w11 /= n;

  // SVD of 2×2 W
  const { u, s, vt } = svd2x2(w00, w01, w10, w11);

  // Sign correction: d = diag(1, det(U)*det(V^T)) to ensure proper rotation
  const detU = u[0] * u[3] - u[1] * u[2];
  const detVt = vt[0] * vt[3] - vt[1] * vt[2];
  const d1 = detU * detVt < 0 ? -1 : 1;

  // R = U * diag(1, d1) * V^T
  const r00 = u[0] * vt[0] + u[1] * d1 * vt[2];
  const r01 = u[0] * vt[1] + u[1] * d1 * vt[3];
  const r10 = u[2] * vt[0] + u[3] * d1 * vt[2];
  const r11 = u[2] * vt[1] + u[3] * d1 * vt[3];

  // Scale
  const scale = (s[0] + s[1] * d1) / sigmaSrc;

  // Translation
  const tx = mdx - scale * (r00 * msx + r01 * msy);
  const ty = mdy - scale * (r10 * msx + r11 * msy);

  return [scale * r00, scale * r01, tx, scale * r10, scale * r11, ty];
}

/**
 * SVD of a 2×2 matrix [[a,b],[c,d]].
 * Returns U (flat [u00,u01,u10,u11]), s ([s1,s2]), Vt (flat [v00,v01,v10,v11]).
 * M = U * diag(s) * Vt.
 */
// Paired statements below map to vectors / 2×2 matrix rows — keep the layout.
// prettier-ignore
function svd2x2(
  a: number, b: number, c: number, d: number,
): { u: number[]; s: [number, number]; vt: number[] } {
  // Eigendecomposition of M^T*M (symmetric, 2×2)
  const p = a * a + c * c;
  const q = a * b + c * d;
  const r = b * b + d * d;

  const halfDiff = (p - r) * 0.5;
  const tau = Math.sqrt(halfDiff * halfDiff + q * q);
  const lambda1 = (p + r) * 0.5 + tau;
  const lambda2 = (p + r) * 0.5 - tau;

  const s1 = Math.sqrt(Math.max(0, lambda1));
  const s2 = Math.sqrt(Math.max(0, lambda2));

  // Eigenvectors of M^T*M → columns of V
  // Column j of V is eigenvector for lambda_j (lambda1 >= lambda2).
  let v00: number, v10: number, v01: number, v11: number;
  if (Math.abs(q) < 1e-10) {
    // M^T*M is diagonal: eigenvalue p for axis [1,0], eigenvalue r for axis [0,1].
    // lambda1 (larger) determines which axis is column 1 of V.
    if (p >= r) {
      v00 = 1; v10 = 0; v01 = 0; v11 = 1;
    } else {
      v00 = 0; v10 = 1; v01 = 1; v11 = 0;
    }
  } else {
    const nx = q, ny = lambda1 - p;
    const len = Math.sqrt(nx * nx + ny * ny);
    v00 = nx / len; v10 = ny / len;
    v01 = -v10; v11 = v00;
  }

  // U columns = M * V_col / s
  let u00: number, u10: number, u01: number, u11: number;
  if (s1 > 1e-10) {
    u00 = (a * v00 + b * v10) / s1;
    u10 = (c * v00 + d * v10) / s1;
  } else {
    u00 = 1; u10 = 0;
  }
  if (s2 > 1e-10) {
    u01 = (a * v01 + b * v11) / s2;
    u11 = (c * v01 + d * v11) / s2;
  } else {
    u01 = -u10; u11 = u00;
  }

  // V^T = [[v00, v10], [v01, v11]]
  return {
    u: [u00, u01, u10, u11],
    s: [s1, s2],
    vt: [v00, v10, v01, v11],
  };
}

/**
 * Warp source face into an aligned square crop using the Umeyama affine transform.
 * Browser-only (requires OffscreenCanvas).
 *
 * The ArcFace template is defined at 112×112; for a different outputSize it is
 * scaled uniformly, so recognition models with other input sizes (e.g. 160)
 * still receive a correctly-aligned crop.
 *
 * @param source - Full source image
 * @param fivePoints - Pixel-space [left_eye, right_eye, nose, left_mouth, right_mouth]
 * @param outputSize - Square output side in pixels (default 112)
 * @returns outputSize×outputSize ImageData of the aligned face crop
 */
/* v8 ignore start */
// Browser-only (OffscreenCanvas); not executable under Node unit tests.
export function warpFace(
  source: ImageData,
  fivePoints: [number, number][],
  outputSize = 112,
): ImageData {
  const s = outputSize / 112;
  const dst: [number, number][] =
    s === 1 ? ARCFACE_DST : ARCFACE_DST.map(([x, y]) => [x * s, y * s]);
  const [a, b, tx, dd, e, ty] = umeyama(fivePoints, dst);

  const srcCanvas = new OffscreenCanvas(source.width, source.height);
  (srcCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(source, 0, 0);

  const out = new OffscreenCanvas(outputSize, outputSize);
  const ctx = out.getContext('2d') as OffscreenCanvasRenderingContext2D;

  // Canvas setTransform(a, b, c, d, e, f) maps: x'=a*x+c*y+e, y'=b*x+d*y+f
  // Our transform:                               x'=a*x+b*y+tx, y'=dd*x+e*y+ty
  // Canvas args:                                 (a,  dd, b,  e,  tx, ty)
  ctx.setTransform(a, dd, b, e, tx, ty);
  ctx.drawImage(srcCanvas, 0, 0);

  return ctx.getImageData(0, 0, outputSize, outputSize);
}
/* v8 ignore stop */
