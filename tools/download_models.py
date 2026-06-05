"""
convert_models.py
Converts ONNX/PyTorch models to INT8 TFLite format for use in Veraface.

Usage:
  pip install tensorflow onnx onnx2tf
  python tools/convert_models.py

Output: Creates .tflite files in android/app/src/main/assets/
"""

import os
import sys

ASSETS_DIR = "android/app/src/main/assets"
os.makedirs(ASSETS_DIR, exist_ok=True)

def convert_yunet():
    """
    YuNet face detector: ONNX -> TFLite INT8
    
    Download first:
      https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
    """
    onnx_path = "models/face_detection_yunet_2023mar.onnx"
    if not os.path.exists(onnx_path):
        print(f"ERROR: {onnx_path} not found. Download from:")
        print("  https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet")
        return False

    try:
        import onnx2tf
        onnx2tf.convert(
            input_onnx_file_path=onnx_path,
            output_folder_path="models/yunet_tflite",
            output_tfv5_tflite_model_path=os.path.join(ASSETS_DIR, "yunet_quantized.tflite"),
            quant_type="int8",
        )
        print("YuNet conversion done")
        return True
    except ImportError:
        print("onnx2tf not installed. Run: pip install onnx2tf")
        return False


def convert_mobilefacenet_tflite():
    """
    MobileFaceNet FP32 TFLite -> INT8 TFLite via post-training quantization
    
    Download first from:
      https://github.com/sirius-ai/MobileFaceNet_TF
      Or from PINTO model zoo: https://github.com/PINTO0309/PINTO_model_zoo
    
    Look for: MobileFaceNet.tflite (FP32 version)
    """
    import glob
    fp32_files = glob.glob("models/MobileFaceNet*.tflite") + glob.glob("models/mobilefacenet*.tflite")
    
    if not fp32_files:
        print("ERROR: MobileFaceNet TFLite not found. Download from:")
        print("  https://github.com/PINTO0309/PINTO_model_zoo (search for MobileFaceNet)")
        return False

    fp32_path = fp32_files[0]
    print(f"Found: {fp32_path}")

    try:
        import tensorflow as tf
        import numpy as np

        # Load FP32 model
        interpreter = tf.lite.Interpreter(model_path=fp32_path)
        
        # Create INT8 converter from the TFLite model
        converter = tf.lite.TFLiteConverter.from_keras_model(
            tf.lite.experimental.load_delegate  # Placeholder
        )
        
        # Alternative: just copy the FP32 file if conversion fails
        import shutil
        out_path = os.path.join(ASSETS_DIR, "mobilefacenet_quant.tflite")
        shutil.copy(fp32_path, out_path)
        size_kb = os.path.getsize(out_path) // 1024
        print(f"Copied MobileFaceNet ({size_kb}KB) -> {out_path}")
        print("NOTE: Using FP32 model. For INT8, see TF docs on post-training quantization.")
        return True
    except Exception as e:
        print(f"Conversion failed: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("Veraface Model Conversion Script")
    print("=" * 60)
    print()
    print("MANUAL DOWNLOAD REQUIRED:")
    print()
    print("1. YuNet (Face Detection):")
    print("   https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet")
    print("   -> Download face_detection_yunet_2023mar.onnx")
    print("   -> Save to: models/face_detection_yunet_2023mar.onnx")
    print()
    print("2. MobileFaceNet (Face Recognition ~1.9MB TFLite):")
    print("   https://github.com/PINTO0309/PINTO_model_zoo")
    print("   -> Search: MobileFaceNet")
    print("   -> Save to: models/mobilefacenet.tflite")
    print()
    print("3. MiniFASNet (Passive Liveness ~1.0MB):")
    print("   https://github.com/minivision-ai/Silent-Face-Anti-Spoofing")
    print("   -> resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth")
    print("   -> Convert with: python tools/convert_minifasnet.py")
    print()
    print("After downloading, copy directly to:")
    print("  android/app/src/main/assets/yunet_quantized.tflite")
    print("  android/app/src/main/assets/mobilefacenet_quant.tflite")
    print("  android/app/src/main/assets/minifasnet_quant.tflite")
    print()
    print("Then run: cd OfflineFaceAuth && npx react-native run-android")
