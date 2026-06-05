#!/usr/bin/env python3
"""
setup.py — One-command Veraface dev environment setup.
Run from the repo root: python setup.py
"""

import os
import subprocess
import sys
import urllib.request
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
APP_DIR    = os.path.join(ROOT, "OfflineFaceAuth")
ASSETS_DIR = os.path.join(APP_DIR, "android", "app", "src", "main", "assets")
MODELS_DIR = os.path.join(ROOT, "models")

def run(cmd, cwd=None):
    print(f"\n$ {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd or ROOT)
    if result.returncode != 0:
        print(f"ERROR: Command failed with code {result.returncode}")
        sys.exit(1)

def step(msg):
    print(f"\n{'='*60}")
    print(f"  {msg}")
    print(f"{'='*60}")

def check(label, condition, fix=None):
    status = "OK" if condition else "MISSING"
    print(f"  [{status:7}] {label}")
    if not condition and fix:
        print(f"           -> {fix}")
    return condition

# ──────────────────────────────────────────────────────────────────────────────

step("1. Checking Prerequisites")
all_ok = True
all_ok &= check("Node.js >= 18", shutil.which("node") is not None, "Install from nodejs.org")
all_ok &= check("npm", shutil.which("npm") is not None)
all_ok &= check("Java (JAVA_HOME)", os.environ.get("JAVA_HOME") is not None,
                "Set JAVA_HOME to Android Studio JDK path")
all_ok &= check("Android SDK (ANDROID_HOME)", os.environ.get("ANDROID_HOME") is not None,
                "Set ANDROID_HOME in environment variables")
all_ok &= check("adb available", shutil.which("adb") is not None,
                "Add platform-tools to PATH")

if not all_ok:
    print("\nPlease fix missing prerequisites, then re-run setup.py")
    sys.exit(1)

step("2. Installing npm Dependencies")
run("npm install", cwd=APP_DIR)

step("3. Checking TFLite Model Assets")
os.makedirs(ASSETS_DIR, exist_ok=True)

required_models = [
    ("yunet_quantized.tflite",       "~150 KB — YuNet face detector"),
    ("mobilefacenet_quant.tflite",   "~1.9 MB — MobileFaceNet recognizer"),
    ("minifasnet_quant.tflite",      "~1.0 MB — MiniFASNet passive liveness"),
]

missing_models = []
for filename, desc in required_models:
    path = os.path.join(ASSETS_DIR, filename)
    if os.path.exists(path):
        size_kb = os.path.getsize(path) // 1024
        check(f"{filename} ({size_kb} KB)", True)
    else:
        check(filename, False, f"Download {desc}")
        missing_models.append(filename)

if missing_models:
    print(f"""
MISSING MODELS — Manual download required:

1. yunet_quantized.tflite (~150KB):
   https://huggingface.co/opencv/face_detection_yunet
   Convert ONNX -> TFLite INT8 using onnx2tf

2. mobilefacenet_quant.tflite (~1.9MB):
   https://github.com/PINTO0309/PINTO_model_zoo
   Search: MobileFaceNet -> download .tflite

3. minifasnet_quant.tflite (~1.0MB):
   https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
   Convert resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth

Place downloaded files in:
  {ASSETS_DIR}
""")

step("4. Checking Connected Device")
result = subprocess.run("adb devices", shell=True, capture_output=True, text=True)
lines = [l for l in result.stdout.strip().split('\n') if 'device' in l and 'List' not in l]
if lines:
    print(f"  Connected: {lines[0]}")
    device_ready = True
else:
    print("  No device connected — connect your Motorola Edge 50 via USB")
    device_ready = False

if missing_models:
    step("5. Status: WAITING FOR MODELS")
    print("""
  Once you download the 3 TFLite models, run:
    cd OfflineFaceAuth
    npx react-native run-android
""")
else:
    step("5. Launching App on Device")
    if device_ready:
        run("npx react-native run-android", cwd=APP_DIR)
    else:
        print("  Connect device and run: cd OfflineFaceAuth && npx react-native run-android")

print("\nSetup complete!")
