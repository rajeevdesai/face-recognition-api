#!/usr/bin/env node
/**
 * Model-weights downloader. Fetches the four weights into a directory you choose
 * (default: ./public/models) — write straight to where your app serves static
 * files, never into node_modules.
 *
 *   npx @rajeevdesai/face-verification-api download public/models
 *   npm run download -- public/models      # from a repo clone
 *
 * Weights are NOT bundled (license + size). All four are Apache-2.0; review
 * NOTICE for attribution and the MS1M-RefineV2 data caveat. Cross-platform
 * (Node >=18, global fetch) — supersedes the old bash models/download.sh.
 */
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve, join } from 'node:path';

/**
 * Single source of truth for the weights. `out` names are what loadModels and
 * the demo expect; keep them stable.
 */
const WEIGHTS = [
  {
    out: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    note: 'MediaPipe FaceLandmarker (Google) — Apache-2.0',
  },
  {
    // facex_nano — Apache-2.0, 256-D embedding, NCHW [1,3,112,112], LFW 95.62%.
    // Trained on MS1M-RefineV2 (dataset restricted; weights Apache-2.0; see NOTICE).
    // Do NOT swap in InsightFace weights (non-commercial license).
    out: 'mobilefacenet.onnx',
    url: 'https://github.com/facex-engine/facex/releases/download/facex-nano-1.0/facex_nano.onnx',
    note: 'facex_nano recognition — Apache-2.0',
  },
  {
    // garciafido/minifasnet-v2-anti-spoofing-onnx — Apache-2.0. NCHW [1,3,80,80],
    // BGR, raw [0,255] (NOT [0,1] — at [0,1] the export collapses to one class).
    // Output [1,3] logits (softmax). Live = index 1; index 2 = screen/video replay.
    // Crop scale 2.7. (Model card's [live,print,replay] order is wrong for these weights.)
    out: 'minifasnet_v2.onnx',
    url: 'https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx',
    note: 'MiniFASNetV2 liveness (crop 2.7) — Apache-2.0',
  },
  {
    // yakhyo/face-anti-spoofing — Apache-2.0. 2nd model in the minivision Silent-Face
    // ensemble. Same convention as V2 (NCHW [1,3,80,80], BGR, [0,255], live=index 1)
    // but crop scale 4.0. Ensembling V2+V1SE hardens print detection.
    out: 'minifasnet_v1se.onnx',
    url: 'https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/MiniFASNetV1SE.onnx',
    note: 'MiniFASNetV1SE liveness (crop 4.0, ensemble) — Apache-2.0',
  },
];

function parseArgs(argv) {
  const args = argv.slice(2).filter((a) => a !== 'download'); // tolerate `... download <dir>`
  if (args.includes('-h') || args.includes('--help')) return { help: true };
  return { dir: args[0] ?? 'public/models' };
}

async function downloadOne(destDir, { out, url }) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`fetch failed (${res.status} ${res.statusText}) for ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(join(destDir, out)));
}

async function main() {
  const { help, dir } = parseArgs(process.argv);
  if (help) {
    console.log(
      'Usage: npx @rajeevdesai/face-verification-api download [dir]\n' +
        '  dir   destination directory for the weights (default: public/models)\n\n' +
        'Downloads 4 Apache-2.0 model files. Serve the directory over HTTP and pass\n' +
        'the paths to loadModels(). See NOTICE for attribution.',
    );
    return;
  }

  const destDir = resolve(process.cwd(), dir);
  await mkdir(destDir, { recursive: true });
  console.log(`Downloading ${WEIGHTS.length} model weights → ${destDir}`);

  for (const w of WEIGHTS) {
    process.stdout.write(`  ${w.out} … `);
    await downloadOne(destDir, w);
    console.log('✓');
  }

  console.log(
    '\nDone. All four are Apache-2.0; review NOTICE for attribution and the\n' +
      'MS1M-RefineV2 data caveat. Serve this directory and point loadModels() at it.',
  );
}

main().catch((err) => {
  console.error(`\nDownload failed: ${err.message}`);
  process.exit(1);
});
