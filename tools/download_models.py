import os
import urllib.request

ASSETS_DIR = r"d:\CSE\Hackathons\nhai hackathon\veraface\OfflineFaceAuth\android\app\src\main\assets"
os.makedirs(ASSETS_DIR, exist_ok=True)

models = {
    "mobilefacenet_quant.tflite": "https://raw.githubusercontent.com/MCarlomagno/FaceRecognitionAuth/master/assets/mobilefacenet.tflite",
    "yunet_quantized.tflite": "https://raw.githubusercontent.com/Kazuhito00/YuNet-ONNX-TFLite-Sample/main/model/face_detection_yunet_120x160.tflite",
    "minifasnet_quant.tflite": "https://raw.githubusercontent.com/yeyupiaoling/Face-Anti-Spoofing/main/models/fas.tflite"
}

for filename, url in models.items():
    path = os.path.join(ASSETS_DIR, filename)
    print(f"Downloading {filename}...")
    try:
        urllib.request.urlretrieve(url, path)
        print(f" -> Saved to {path}")
    except Exception as e:
        print(f" -> Failed: {e}")

print("All models downloaded!")
