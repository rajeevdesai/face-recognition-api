import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'demo', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Browser APIs used across the pipeline.
        ImageData: 'readonly',
        OffscreenCanvas: 'readonly',
        OffscreenCanvasRenderingContext2D: 'readonly',
        CanvasRenderingContext2D: 'readonly',
        HTMLImageElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        ImageBitmap: 'readonly',
        createImageBitmap: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      // Internal test/reset helpers use a leading underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Node CLI (weights downloader), not browser code.
    files: ['bin/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
  prettier,
);
