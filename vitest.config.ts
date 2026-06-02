import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['src/**/*.ts'],
      // Excluded from the coverage denominator:
      //  - index.ts: re-exports only
      //  - types.ts: types only, no runtime
      //  - detect.ts / models.ts: browser-only orchestration (MediaPipe + model
      //    loading) exercised by the browser integration suite, not Node units
      exclude: ['src/index.ts', 'src/types.ts', 'src/detect.ts', 'src/models.ts'],
      // Floors that gate regressions, kept a few points below current
      // (~96/92/100/98) with margin. Browser-only functions that can't run under
      // Node (warpFace, toImageData, imageDataToCanvas, cropForLiveness) are marked
      // `/* v8 ignore */` at the source, so coverage here reflects Node-testable
      // logic. The remaining gaps are pure-math edge branches in align.ts (svd2x2).
      thresholds: {
        statements: 88,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
