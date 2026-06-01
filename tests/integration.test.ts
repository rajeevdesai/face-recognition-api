/**
 * Integration tests — require browser APIs (createImageBitmap, OffscreenCanvas, WASM).
 * Skipped automatically in Node / CI. Run manually:
 *   npm run demo  → open browser, upload fixtures from tests/fixtures/
 *   Or: vite-node tests/integration.test.ts (if polyfills are available)
 */

import { describe, it, expect, beforeAll } from 'vitest';

const BROWSER_ONLY = typeof createImageBitmap === 'undefined';

describe.skipIf(BROWSER_ONLY)('integration — real pipeline', () => {
  // Dynamic imports so Node doesn't fail on parse when browser APIs are absent
  let loadModels: typeof import('../src/models.js').loadModels;
  let compareFaces: typeof import('../src/compare.js').compareFaces;

  beforeAll(async () => {
    ({ loadModels } = await import('../src/models.js'));
    ({ compareFaces } = await import('../src/compare.js'));
    await loadModels({
      faceLandmarkerPath: 'models/face_landmarker.task',
      recognitionModelPath: 'models/mobilefacenet.onnx',
      livenessModelPath: 'models/minifasnet_v2.onnx',
    });
  });

  it('same person → match:true', async () => {
    const result = await compareFaces(
      'tests/fixtures/person_a_1.jpg',
      'tests/fixtures/person_a_2.jpg',
    );
    expect(result.match).toBe(true);
    expect(result.details.distance).toBeLessThan(0.5);
  });

  it('different people → identity_mismatch', async () => {
    const result = await compareFaces(
      'tests/fixtures/person_a_1.jpg',
      'tests/fixtures/person_b_1.jpg',
    );
    expect(result.match).toBe(false);
    expect(result.flags).toContain('identity_mismatch');
  });

  it('blank image → face_missing', async () => {
    const result = await compareFaces('tests/fixtures/person_a_1.jpg', 'tests/fixtures/blank.png');
    expect(result.match).toBe(false);
    expect(result.flags).toContain('face_missing');
  });
});
