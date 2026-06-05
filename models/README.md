# Model Assets — Download Instructions

Place the following quantized TFLite models in this directory:
`android/app/src/main/assets/`

## Required Files

| Filename | Size | Source |
|---|---|---|
| `yunet_quantized.tflite` | ~150 KB | [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) |
| `mobilefacenet_quant.tflite` | ~1.9 MB | [InsightFace](https://github.com/deepinsight/insightface) |
| `minifasnet_quant.tflite` | ~1.0 MB | [Silent Face Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing) |

## Download Commands

```bash
# Create assets directory
mkdir -p android/app/src/main/assets

# YuNet — Face Detection
# Download face_detection_yunet_2023mar.onnx from OpenCV Zoo,
# then convert to TFLite INT8:
# python tools/convert_yunet_to_tflite.py

# MobileFaceNet — Recognition
# Get from: https://github.com/sirius-ai/MobileFaceNet_TF
# or use the pre-quantized version from InsightFace model zoo

# MiniFASNet — Passive Liveness
# Clone: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
# Use: resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth
# Convert to TFLite INT8
```

## Notes
- All models are INT8 quantized for minimum size and maximum speed
- Total footprint: ~3.05 MB (well within 20 MB limit)
- NNAPI delegate requires Android API 28+ (Android 9.0+)
- Models are NOT included in this repository due to license constraints
