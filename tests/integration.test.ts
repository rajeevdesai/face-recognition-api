/**
 * Integration tests — require browser APIs (createImageBitmap, OffscreenCanvas, WASM)
 * AND locally-provided fixtures. Skipped automatically in Node / CI, and skipped at
 * runtime if the models or fixtures aren't present (so a partial setup doesn't fail).
 *
 * To run: serve a browser/polyfilled env, place the model weights under models/, and
 * drop your own *consented* images in tests/fixtures/ (these are gitignored — do not
 * commit faces):
 *   person_a_1.jpg, person_a_2.jpg  — two photos of the same person
 *   person_b_1.jpg                  — a different person
 *   blank.png                       — an image with no face
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BROWSER_ONLY = typeof createImageBitmap === 'undefined';

describe.skipIf(BROWSER_ONLY)('integration — real pipeline', () => {
  // Dynamic imports so Node doesn't fail on parse when browser APIs are absent
  let loadModels: typeof import('../src/models.js').loadModels;
  let compareFaces: typeof import('../src/compare.js').compareFaces;
  let ready = false;

  beforeAll(async () => {
    try {
      ({ loadModels } = await import('../src/models.js'));
      ({ compareFaces } = await import('../src/compare.js'));
      await loadModels({
        faceLandmarkerPath: 'models/face_landmarker.task',
        recognitionModelPath: 'models/mobilefacenet.onnx',
        livenessModelPath: ['models/minifasnet_v2.onnx', 'models/minifasnet_v1se.onnx'],
        liveness: [{ cropScale: 2.7 }, { cropScale: 4.0 }],
      });
      // Probe a fixture; if absent, skip the suite rather than fail.
      await compareFaces('tests/fixtures/person_a_1.jpg', 'tests/fixtures/person_a_1.jpg', {
        checkLiveness: false,
      });
      ready = true;
    } catch (err) {
      console.warn(
        `[integration] skipped — models/fixtures unavailable: ${(err as Error).message}`,
      );
    }
  });

  it('same person → match:true', async (ctx) => {
    if (!ready) return ctx.skip();
    const result = await compareFaces(
      'tests/fixtures/person_a_1.jpg',
      'tests/fixtures/person_a_2.jpg',
    );
    expect(result.match).toBe(true);
    expect(result.details.distance).toBeLessThan(0.5);
  });

  it('different people → identity_mismatch', async (ctx) => {
    if (!ready) return ctx.skip();
    const result = await compareFaces(
      'tests/fixtures/person_a_1.jpg',
      'tests/fixtures/person_b_1.jpg',
    );
    expect(result.match).toBe(false);
    expect(result.flags).toContain('identity_mismatch');
  });

  it('blank image → face_missing', async (ctx) => {
    if (!ready) return ctx.skip();
    const result = await compareFaces('tests/fixtures/person_a_1.jpg', 'tests/fixtures/blank.png');
    expect(result.match).toBe(false);
    expect(result.flags).toContain('face_missing');
  });
});
