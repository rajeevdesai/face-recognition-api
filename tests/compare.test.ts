import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompareResult } from '../src/types.js';

// ---- Mocks ----------------------------------------------------------------

vi.mock('../src/models.js', () => ({
  getModels: () => ({
    faceLandmarker: {},
    session: {},
    // Default ensemble: two liveness models (V2 @2.7, V1SE @4.0)
    livenessSessions: [{}, {}],
    recognitionConfig: { inputSize: 112, metric: 'cosine' },
    livenessConfigs: [
      { cropScale: 2.7, inputSize: 80 },
      { cropScale: 4.0, inputSize: 80 },
    ],
  }),
}));

vi.mock('../src/image.js', () => ({
  toImageData: async (input: unknown) => input as ImageData,
  imageDataToCanvas: (d: unknown) => d,
}));

const mockDetect = vi.fn();
vi.mock('../src/detect.js', () => ({
  detectFaces: (...args: unknown[]) => mockDetect(...args),
}));

const mockEmbed = vi.fn();
vi.mock('../src/embed.js', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  distance: (a: Float32Array, b: Float32Array) => {
    // Simple: treat arrays as scalars stored at index 0 for test control
    return Math.abs(a[0] - b[0]);
  },
}));

vi.mock('../src/align.js', () => ({
  extractFivePoints: () => [
    [0, 0],
    [1, 0],
    [0.5, 0.5],
    [0.2, 1],
    [0.8, 1],
  ],
  warpFace: () =>
    ({ width: 112, height: 112, data: new Uint8ClampedArray(112 * 112 * 4) }) as ImageData,
}));

const mockScoreLiveness = vi.fn();
vi.mock('../src/liveness.js', () => ({
  cropForLiveness: () =>
    ({ width: 80, height: 80, data: new Uint8ClampedArray(80 * 80 * 4) }) as ImageData,
  scoreLiveness: (...args: unknown[]) => mockScoreLiveness(...args),
}));

import { compareFaces, DEFAULT_THRESHOLD } from '../src/compare.js';

// ---- Helpers ---------------------------------------------------------------

type LandmarkFace = { landmarks: unknown[]; boundingBoxArea: number };

function makeFace(area = 0.5): LandmarkFace {
  return { landmarks: Array(478).fill({ x: 0, y: 0, z: 0 }), boundingBoxArea: area };
}

function dummyImageData(): ImageData {
  return {
    width: 100,
    height: 100,
    data: new Uint8ClampedArray(100 * 100 * 4),
  } as unknown as ImageData;
}

function makeEmb(value: number): Float32Array {
  const e = new Float32Array(512);
  e[0] = value;
  return e;
}

// ---- Tests -----------------------------------------------------------------

beforeEach(() => {
  mockDetect.mockReset();
  mockEmbed.mockReset();
  mockScoreLiveness.mockReset();
  mockScoreLiveness.mockResolvedValue(0.99); // default: passes liveness
});

describe('flag: baseline_missing', () => {
  it('returns false + baseline_missing when no baseline faces found', async () => {
    mockDetect.mockReturnValueOnce([]).mockReturnValueOnce([makeFace()]);
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.match).toBe(false);
    expect(result.flags).toContain('baseline_missing');
    expect(result.details.baselineFacesFound).toBe(0);
  });
});

describe('flag: face_missing', () => {
  it('returns false + face_missing when no current faces found', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([]);
    mockEmbed.mockResolvedValue(makeEmb(0));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.match).toBe(false);
    expect(result.flags).toContain('face_missing');
    expect(result.details.currentFacesFound).toBe(0);
  });
});

describe('flag: baseline_ambiguous', () => {
  it('sets baseline_ambiguous when >1 baseline face but continues', async () => {
    mockDetect
      .mockReturnValueOnce([makeFace(0.8), makeFace(0.3)])
      .mockReturnValueOnce([makeFace()]);
    mockEmbed.mockResolvedValue(makeEmb(0));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.flags).toContain('baseline_ambiguous');
    // Should still attempt comparison
    expect(result.details.baselineFacesFound).toBe(2);
  });
});

describe('flag: multiple_faces', () => {
  it('sets multiple_faces when >1 current face', async () => {
    mockDetect
      .mockReturnValueOnce([makeFace()])
      .mockReturnValueOnce([makeFace(0.7), makeFace(0.3)]);
    mockEmbed.mockResolvedValue(makeEmb(0));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.flags).toContain('multiple_faces');
    expect(result.details.currentFacesFound).toBe(2);
  });
});

describe('flag: identity_mismatch', () => {
  it('sets identity_mismatch when cosine distance > threshold', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    // distance mock: |a[0] - b[0]| = |0 - 0.9| = 0.9 > DEFAULT_THRESHOLD
    mockEmbed.mockResolvedValueOnce(makeEmb(0)).mockResolvedValueOnce(makeEmb(0.9));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.match).toBe(false);
    expect(result.flags).toContain('identity_mismatch');
  });
});

describe('flag: low_confidence', () => {
  it('sets low_confidence when distance in grey zone (80–100% of threshold)', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    // distance = 0.45, threshold = 0.5 → 0.9 * threshold = in grey zone
    mockEmbed.mockResolvedValueOnce(makeEmb(0)).mockResolvedValueOnce(makeEmb(0.45));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.match).toBe(true);
    expect(result.flags).toContain('low_confidence');
  });

  it('does NOT set low_confidence when clearly below grey zone', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    mockEmbed.mockResolvedValueOnce(makeEmb(0)).mockResolvedValueOnce(makeEmb(0.1));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.match).toBe(true);
    expect(result.flags).not.toContain('low_confidence');
  });
});

describe('confidence formula', () => {
  it('confidence = 1 when distance = 0', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    mockEmbed.mockResolvedValue(makeEmb(0));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.confidence).toBeCloseTo(1, 5);
  });

  it('confidence = 0 at threshold boundary', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    // distance = threshold → confidence = 0
    mockEmbed.mockResolvedValueOnce(makeEmb(0)).mockResolvedValueOnce(makeEmb(DEFAULT_THRESHOLD));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.confidence).toBeCloseTo(0, 5);
  });

  it('confidence is clamped to 0 when distance > threshold', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    mockEmbed
      .mockResolvedValueOnce(makeEmb(0))
      .mockResolvedValueOnce(makeEmb(DEFAULT_THRESHOLD + 0.3));
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.confidence).toBe(0);
  });
});

describe('multiple_faces best-match selection', () => {
  it('picks the current face closest to baseline', async () => {
    mockDetect
      .mockReturnValueOnce([makeFace()])
      .mockReturnValueOnce([makeFace(0.7), makeFace(0.3)]);
    // baseline emb, then two current embs. Best match = emb with smaller distance to baseline.
    mockEmbed
      .mockResolvedValueOnce(makeEmb(0)) // baseline
      .mockResolvedValueOnce(makeEmb(0.8)) // current face 1 — distance 0.8 (mismatch)
      .mockResolvedValueOnce(makeEmb(0.2)); // current face 2 — distance 0.2 (match)
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.match).toBe(true);
    expect(result.details.distance).toBeCloseTo(0.2, 5);
  });
});

describe('custom threshold', () => {
  it('respects caller-supplied threshold', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    mockEmbed.mockResolvedValueOnce(makeEmb(0)).mockResolvedValueOnce(makeEmb(0.3));
    // With threshold 0.2, distance 0.3 should mismatch
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData(), {
      threshold: 0.2,
    });
    expect(result.match).toBe(false);
    expect(result.details.threshold).toBe(0.2);
  });
});

describe('flag: liveness_fail', () => {
  it('forces match false + liveness_fail when score below threshold', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    mockEmbed.mockResolvedValue(makeEmb(0)); // distance 0 — identity would match
    mockScoreLiveness.mockResolvedValue(0.1);
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.match).toBe(false);
    expect(result.flags).toContain('liveness_fail');
    expect(result.details.livenessScore).toBeCloseTo(0.1, 5);
  });

  it('skips liveness when checkLiveness:false', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    mockEmbed.mockResolvedValue(makeEmb(0));
    mockScoreLiveness.mockResolvedValue(0.1); // would fail if run
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData(), {
      checkLiveness: false,
    });
    expect(result.match).toBe(true);
    expect(result.flags).not.toContain('liveness_fail');
    expect(result.details.livenessScore).toBeUndefined();
  });

  it('averages the live scores across an ensemble', async () => {
    mockDetect.mockReturnValueOnce([makeFace()]).mockReturnValueOnce([makeFace()]);
    mockEmbed.mockResolvedValue(makeEmb(0)); // identity matches
    // two liveness models → scored in order; mean(0.9, 0.1) = 0.5
    mockScoreLiveness.mockResolvedValueOnce(0.9).mockResolvedValueOnce(0.1);
    const result: CompareResult = await compareFaces(dummyImageData(), dummyImageData());
    expect(result.details.livenessScore).toBeCloseTo(0.5, 5);
    expect(mockScoreLiveness).toHaveBeenCalledTimes(2);
  });
});
