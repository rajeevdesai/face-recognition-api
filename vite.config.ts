import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig(() => {
  return {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        name: 'FaceRecognition',
        formats: ['es', 'umd'],
        fileName: (format) =>
          format === 'es' ? 'face-verification-api.js' : 'face-verification-api.umd.cjs',
      },
      rollupOptions: {
        external: ['onnxruntime-web', '@mediapipe/tasks-vision'],
        output: {
          globals: {
            'onnxruntime-web': 'ort',
            '@mediapipe/tasks-vision': 'mediapipeTasks',
          },
        },
      },
    },
    plugins: [dts({ insertTypesEntry: true })],
  };
});
