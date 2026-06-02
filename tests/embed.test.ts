import { describe, it, expect, vi } from 'vitest';
import type * as ort from 'onnxruntime-web';

// embed.ts imports onnxruntime-web at module load; stub it (Tensor only needs to construct).
vi.mock('onnxruntime-web', () => ({ Tensor: class {} }));

import {
  embed,
  l2normalize,
  cosineDistance,
  euclideanDistance,
  distance,
  resolveRecognitionConfig,
  RECOGNITION_DEFAULTS,
} from '../src/embed.js';

/** Fake session whose run() returns a fixed embedding, regardless of input. */
function fakeSession(embedding: number[]): ort.InferenceSession {
  return {
    inputNames: ['input'],
    outputNames: ['embedding'],
    run: async () => ({ embedding: { data: Float32Array.from(embedding) } }),
  } as unknown as ort.InferenceSession;
}

function norm(v: Float32Array): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

const unit = (v: number[]) => l2normalize(Float32Array.from(v));

describe('l2normalize', () => {
  it('scales any vector to unit length', () => {
    const out = l2normalize(new Float32Array([3, 4]));
    expect(norm(out)).toBeCloseTo(1, 6);
    expect(out[0]).toBeCloseTo(0.6, 6);
    expect(out[1]).toBeCloseTo(0.8, 6);
  });

  it('mutates in place and returns the same array', () => {
    const v = new Float32Array([1, 2, 2]);
    const out = l2normalize(v);
    expect(out).toBe(v);
    expect(norm(v)).toBeCloseTo(1, 6);
  });

  it('leaves a zero vector untouched (no divide-by-zero)', () => {
    const out = l2normalize(new Float32Array([0, 0, 0]));
    expect(Array.from(out)).toEqual([0, 0, 0]);
    expect(Array.from(out).some(Number.isNaN)).toBe(false);
  });
});

describe('cosineDistance', () => {
  it('is ~0 for identical direction', () => {
    expect(cosineDistance(unit([1, 1, 1]), unit([2, 2, 2]))).toBeCloseTo(0, 6);
  });

  it('is ~1 for orthogonal vectors', () => {
    expect(cosineDistance(unit([1, 0]), unit([0, 1]))).toBeCloseTo(1, 6);
  });

  it('is ~2 for opposite vectors', () => {
    expect(cosineDistance(unit([1, 0]), unit([-1, 0]))).toBeCloseTo(2, 6);
  });

  it('normalizes internally (handles non-unit inputs)', () => {
    expect(cosineDistance(Float32Array.from([1, 1, 1]), Float32Array.from([2, 2, 2]))).toBeCloseTo(
      0,
      6,
    );
  });
});

describe('euclideanDistance', () => {
  it('is 0 for identical vectors', () => {
    expect(
      euclideanDistance(Float32Array.from([1, 2, 3]), Float32Array.from([1, 2, 3])),
    ).toBeCloseTo(0, 6);
  });

  it('is the L2 norm of the difference', () => {
    expect(euclideanDistance(Float32Array.from([0, 0]), Float32Array.from([3, 4]))).toBeCloseTo(
      5,
      6,
    );
  });
});

describe('distance metric dispatch', () => {
  it('defaults to cosine', () => {
    expect(distance(unit([1, 0]), unit([0, 1]))).toBeCloseTo(1, 6);
  });

  it('uses euclidean when selected', () => {
    expect(distance(Float32Array.from([0, 0]), Float32Array.from([3, 4]), 'euclidean')).toBeCloseTo(
      5,
      6,
    );
  });
});

describe('embed', () => {
  const face = {
    width: 112,
    height: 112,
    data: new Uint8ClampedArray(112 * 112 * 4),
  } as unknown as ImageData;

  it('runs the session and L2-normalizes by default', async () => {
    const out = await embed(fakeSession([3, 4]), face);
    expect(out).toBeInstanceOf(Float32Array);
    expect(norm(out)).toBeCloseTo(1, 6);
  });

  it('returns the raw embedding when l2normalize is false', async () => {
    const cfg = resolveRecognitionConfig({ l2normalize: false });
    const out = await embed(fakeSession([3, 4]), face, cfg);
    expect(Array.from(out)).toEqual([3, 4]);
  });
});

describe('resolveRecognitionConfig', () => {
  it('returns defaults when given nothing', () => {
    expect(resolveRecognitionConfig()).toEqual(RECOGNITION_DEFAULTS);
  });

  it('applies overrides and expands scalar mean/std', () => {
    const c = resolveRecognitionConfig({
      inputSize: 160,
      channelOrder: 'BGR',
      mean: 0,
      std: 255,
      metric: 'euclidean',
      l2normalize: false,
    });
    expect(c.inputSize).toBe(160);
    expect(c.channelOrder).toBe('BGR');
    expect(c.mean).toEqual([0, 0, 0]);
    expect(c.std).toEqual([255, 255, 255]);
    expect(c.metric).toBe('euclidean');
    expect(c.l2normalize).toBe(false);
  });
});
