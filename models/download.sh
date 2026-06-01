#!/usr/bin/env bash
# Download model weights into models/. Not committed (see .gitignore).
#
# Recognition model is facex_nano (set below) — verified (Open Risk #1) as a plain,
# unencrypted ONNX: input `input` [1,3,112,112], output `embedding` [1,256].
# Licensing: keep recognition weights Apache-2.0 — do NOT swap in InsightFace
# weights (non-commercial license).

set -euo pipefail
cd "$(dirname "$0")"

FACE_LANDMARKER_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

# facex_nano — Apache-2.0, 256-D embedding, NCHW [1,3,112,112], LFW 95.62%
# Trained on MS1M-RefineV2 (dataset restricted; weights are Apache-2.0). See NOTICE.
MOBILEFACENET_URL="https://github.com/facex-engine/facex/releases/download/facex-nano-1.0/facex_nano.onnx"

# MiniFASNetV2 — garciafido/minifasnet-v2-anti-spoofing-onnx (Apache-2.0).
# Input: NCHW [1,3,80,80], BGR, [0,255] (NOT [0,1] — at [0,1] the export
# collapses to index 2 for every input). Output: [1,3] logits (apply softmax).
# Live class is index 1; index 2 is screen/video replay. The model card's
# [live,print,replay] order is wrong for these weights. Crop scale 2.7.
LIVENESS_URL="https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx/resolve/main/minifasnet_v2.onnx"

# MiniFASNetV1SE — yakhyo/face-anti-spoofing (Apache-2.0), the 2nd model in the
# minivision Silent-Face ensemble. Same convention as V2 (NCHW [1,3,80,80], BGR,
# [0,255], live=index 1) but crop scale 4.0. Ensembling V2+V1SE hardens print
# detection (default config averages the two live scores).
LIVENESS_V1SE_URL="https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/MiniFASNetV1SE.onnx"

echo "Downloading FaceLandmarker .task (Apache-2.0, Google MediaPipe)…"
curl -L --progress-bar -o face_landmarker.task "$FACE_LANDMARKER_URL"

echo "Downloading facex_nano ONNX (Apache-2.0)…"
curl -L --progress-bar -o mobilefacenet.onnx "$MOBILEFACENET_URL"

echo "Downloading MiniFASNetV2 ONNX (Silent-Face Anti-Spoofing)…"
curl -L --progress-bar -o minifasnet_v2.onnx "$LIVENESS_URL"

echo "Downloading MiniFASNetV1SE ONNX (Silent-Face ensemble, 2nd model)…"
curl -L --progress-bar -o minifasnet_v1se.onnx "$LIVENESS_V1SE_URL"

echo "Done. Models saved to models/"
