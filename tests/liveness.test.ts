import { describe, it, expect, vi } from 'vitest';
import type * as ort from 'onnxruntime-web';

// Stub the runtime; scoreLiveness only needs `new ort.Tensor(...)` to not throw.
vi.mock('onnxruntime-web', () => ({
  Tensor: class {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[],
    ) {}
  },
}));

import { scoreLiveness } from '../src/liveness.js';

/** Fake session whose run() returns fixed logits, regardless of input. */
function fakeSession(logits: number[]): ort.InferenceSession {
  return {
    inputNames: ['input'],
    outputNames: ['output'],
    run: async () => ({ output: { data: Float32Array.from(logits) } }),
  } as unknown as ort.InferenceSession;
}

function dummyCrop(): ImageData {
  return {
    width: 80,
    height: 80,
    data: new Uint8ClampedArray(80 * 80 * 4),
  } as unknown as ImageData;
}

const liveProb = (l: number[]) => {
  const e = l.map(Math.exp);
  return e[1] / (e[0] + e[1] + e[2]);
};

describe('scoreLiveness', () => {
  it('returns the softmax probability of the live class (index 1)', async () => {
    const logits = [-1, 2, 0];
    const score = await scoreLiveness(fakeSession(logits), dummyCrop());
    expect(score).toBeCloseTo(liveProb(logits), 6);
  });

  // Regression: live is index 1 (minivision convention, label 1 = real),
  // confirmed empirically with live/replay/print captures. A live-dominant
  // output must score HIGH.
  it('scores high when the live logit (index 1) dominates', async () => {
    const score = await scoreLiveness(fakeSession([0, 5, 0]), dummyCrop());
    expect(score).toBeGreaterThan(0.9);
  });

  it('scores low when a spoof class dominates', async () => {
    const score = await scoreLiveness(fakeSession([0, 0, 5]), dummyCrop());
    expect(score).toBeLessThan(0.05);
  });
});
