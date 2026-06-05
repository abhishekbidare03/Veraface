# Veraface — Offline Biometric Attendance System

**NHAI Hackathon 7.0 | Team Submission**

> Sub-150ms offline facial authentication with dual-layer liveness, AES-256 encrypted storage, and secure AWS sync.

---

## 🎯 Problem Statement

NHAI field projects require accurate personnel attendance tracking in remote, internet-poor environments where cloud-based biometric systems are unreliable. Veraface solves this with a **100% offline-first** face recognition system built on quantized AI models that run at < 150ms on commodity Android hardware.

## ✨ Key Features

| Feature | Implementation |
|---|---|
| **Face Detection** | YuNet INT8 TFLite — 14ms avg |
| **Face Recognition** | MobileFaceNet INT8 — 58ms avg, >98.4% accuracy |
| **Passive Liveness** | MiniFASNet INT8 — rejects photos/screens/masks |
| **Active Liveness** | Blink / Smile / Head-turn geometry challenges |
| **Encrypted Storage** | SQLCipher AES-256 encrypted SQLite |
| **Secure Sync** | AWS Lambda + API Gateway (auto-triggers on reconnect) |
| **Auto-Purge** | Synced records >30 days automatically deleted |
| **GPS Tagging** | Attendance records include lat/lon |

## 🏗️ Architecture

```
Camera Frame
    │
    ▼
YuNet Detection ──→ No Face? → "Center face in oval"
    │
    ▼
Affine Alignment → 112×112 crop
    │
    ├──────────────────────────┐
    ▼                          ▼
MobileFaceNet             MiniFASNet
(128-D Embedding)     (Liveness Score ≥ 0.85)
    │                          │
    └──────────┬───────────────┘
               ▼
    Cosine Similarity Match (≥ 0.65)
               │
               ▼
    Active Challenge (Blink/Smile/Turn)
               │
               ▼
    ✅ PASS → Log Attendance + GPS
    ❌ FAIL → Show reason + retry
               │
               ▼ (when online)
    AWS Lambda → DynamoDB (30-day TTL)
```

## 📂 Project Structure

```
veraface/
├── OfflineFaceAuth/              ← React Native app
│   ├── src/
│   │   ├── components/
│   │   │   ├── FaceOverlay.tsx        ← Animated camera UI
│   │   │   └── LivenessPrompt.tsx     ← Challenge countdown
│   │   ├── native/
│   │   │   └── FaceAuthBridge.ts      ← Native module bridge
│   │   ├── navigation/
│   │   │   └── AppNavigator.tsx
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx
│   │   │   ├── EnrollScreen.tsx
│   │   │   ├── RecognizeScreen.tsx
│   │   │   └── AttendanceLogScreen.tsx
│   │   ├── services/
│   │   │   ├── DatabaseService.ts     ← SQLCipher encrypted DB
│   │   │   ├── FaceAuthService.ts     ← Pipeline orchestrator
│   │   │   └── SyncService.ts         ← AWS sync + auto-trigger
│   │   └── utils/
│   │       ├── embeddingUtils.ts      ← Cosine sim, L2 norm, base64
│   │       └── livenessUtils.ts       ← EAR/MAR/yaw geometry
│   └── android/
│       └── app/src/main/java/com/offlinefaceauth/
│           ├── FaceAuthModule.kt      ← RN bridge module
│           ├── FaceAuthPackage.kt     ← Package registration
│           ├── TFLiteRunner.kt        ← NNAPI base class
│           ├── YuNetDetector.kt       ← Face detection + alignment
│           ├── MobileFaceNetRecognizer.kt
│           ├── MiniFASNetLiveness.kt  ← Passive anti-spoof
│           └── MediaPipeLandmarks.kt  ← Active liveness geometry
├── aws/
│   ├── lambda_attendance.py          ← Lambda handler
│   └── README.md                     ← AWS setup guide
├── docs/
│   ├── architecture.md
│   ├── benchmarks.md
│   └── integration-guide.md
├── models/
│   └── README.md                     ← Model download instructions
├── tools/
│   └── download_models.py
└── setup.py                          ← One-command setup
```

## 🚀 Quick Start

### Prerequisites

```
Node.js >= 18
Android Studio (with JDK 17)
Android SDK API 26+
USB-connected Android device (USB debugging ON)
```

> **JDK Note**: Use **JDK 17** (bundled with Android Studio). IBM Semeru / OpenJ9 JDKs are
> incompatible with Gradle 9. Set `JAVA_HOME` to Android Studio's JDK:
> `C:\Program Files\Android\Android Studio\jbr`

### 1. Install Dependencies

```bash
cd veraface/OfflineFaceAuth
npm install
```

### 2. Download TFLite Models

Place these in `android/app/src/main/assets/`:

| File | Size | Source |
|---|---|---|
| `yunet_quantized.tflite` | ~150 KB | [HuggingFace](https://huggingface.co/opencv/face_detection_yunet) → convert ONNX |
| `mobilefacenet_quant.tflite` | ~1.9 MB | [PINTO_model_zoo](https://github.com/PINTO0309/PINTO_model_zoo) |
| `minifasnet_quant.tflite` | ~1.0 MB | [Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing) |

### 3. Run on Device

```bash
npx react-native run-android
```

Or use the setup script:

```bash
python setup.py
```

## 🔐 Security Design

- **No raw face storage** — only 128-dim × 4 bytes = 512 bytes per person
- **AES-256 at rest** — SQLCipher encrypted database
- **HTTPS in transit** — API key authenticated AWS endpoint
- **Auto-purge** — synced records older than 30 days are deleted

## ⚡ Performance

| Stage | Avg Latency | Target |
|---|---|---|
| YuNet detection | 15 ms | < 100 ms ✅ |
| MobileFaceNet | 58 ms | < 300 ms ✅ |
| MiniFASNet liveness | 38 ms | < 300 ms ✅ |
| **End-to-end** | **~125 ms** | **< 1 s** ✅ |

> Recognition (MobileFaceNet + MiniFASNet) runs in parallel via Kotlin coroutines.

## 📋 Known Setup Issues

| Issue | Solution |
|---|---|
| IBM Semeru JDK incompatible with Gradle 9 | Set `JAVA_HOME` to Android Studio's bundled JDK 17 |
| Models not initialized error | Download 3 TFLite files to `assets/` |
| Camera permission denied | Grant in Settings → Apps → Veraface → Camera |
| NNAPI not available | App falls back to CPU automatically |

## 📄 License

MIT License. Built for NHAI Hackathon 7.0.
