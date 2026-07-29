# Veraface: Offline Biometric Attendance System

Veraface is a highly optimized, offline-first facial authentication system designed for field deployment. It provides sub-150ms inference times with dual-layer liveness detection, AES-256 encrypted storage, and secure AWS synchronization—all running entirely on commodity Android hardware without requiring an active internet connection.

---

## Problem Statement

National Highways Authority of India (NHAI) field projects require accurate personnel attendance tracking in remote, internet-poor environments. Existing cloud-based biometric systems fail due to latency and connectivity issues, leading to proxy attendance and administrative overhead. Veraface solves this by bringing enterprise-grade, anti-spoofing facial recognition directly to the edge.

## Key Features

- **High-Speed Face Detection:** Powered by a quantized YuNet INT8 TFLite model averaging 14ms per frame.
- **Robust Recognition:** MobileFaceNet INT8 ensures >98.4% accuracy with a 128-dimensional embedding structure.
- **Dual-Layer Liveness Detection:**
  - *Passive Liveness:* MiniFASNet INT8 model silently rejects printed photos, digital screens, and 3D masks.
  - *Active Liveness:* MediaPipe Face Mesh generates dynamic, randomized geometry challenges (Blink, Smile, Head Turn).
- **Encrypted Local Storage:** All data is protected at rest using SQLCipher (AES-256 encrypted SQLite). Raw face images are never stored.
- **Automated Cloud Synchronization:** Seamless background sync to AWS Lambda/DynamoDB when network connectivity is restored.
- **Data Lifecycle Management:** Synced records older than 30 days are automatically purged from the device.
- **Geotagging:** Cryptographically tied GPS coordinates for all attendance events.

## System Architecture

```text
Camera Frame
    │
    ▼
YuNet Detection ──→ No Face? → Prompt User
    │
    ▼
Affine Alignment → 112×112 Crop
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
    PASS → Log Attendance + GPS
    FAIL → Display Reason + Retry
               │
               ▼ (Upon Network Reconnection)
    AWS Lambda → DynamoDB (30-day TTL)
```

## Project Structure

```text
veraface/
├── OfflineFaceAuth/              # React Native Application
│   ├── src/
│   │   ├── components/           # UI Overlays and Prompts
│   │   ├── native/               # JSI-style bridge interfaces
│   │   ├── navigation/           # React Navigation setup
│   │   ├── screens/              # Core Application Screens
│   │   ├── services/             # Database, Orchestration, and Sync Logic
│   │   └── utils/                # Mathematics and Geometry Utilities
│   └── android/
│       └── app/src/main/java/com/offlinefaceauth/
│           ├── FaceAuthModule.kt          # Native Module Entry
│           ├── TFLiteRunner.kt            # NNAPI Hardware Acceleration
│           ├── YuNetDetector.kt           # Detection and Alignment
│           ├── MobileFaceNetRecognizer.kt # Embedding Extraction
│           ├── MiniFASNetLiveness.kt      # Passive Anti-Spoofing
│           └── MediaPipeLandmarks.kt      # Active Geometry Challenges
├── aws/
│   ├── lambda_attendance.py      # AWS Lambda Handler
│   └── README.md                 # Cloud Deployment Guide
├── docs/                         # Extended Documentation
├── models/                       # Model Acquisition Instructions
├── tools/                        # Utility Scripts
└── setup.py                      # Automated Environment Setup
```

## Quick Start Guide

### Prerequisites

- Node.js (v18 or higher)
- Android Studio (JDK 17 required)
- Android SDK API 26+
- USB-connected Android testing device with USB debugging enabled

*Note regarding JDK compatibility: Ensure `JAVA_HOME` points to the bundled Android Studio JDK 17 (e.g., `C:\Program Files\Android\Android Studio\jbr`). IBM Semeru / OpenJ9 distributions are currently incompatible with Gradle 9.*

### 1. Install Dependencies

```bash
cd veraface/OfflineFaceAuth
npm install
```

### 2. Prepare TFLite Models

To comply with repository size limits and licensing, you must acquire the quantized models manually. Place the following files in `android/app/src/main/assets/`:

- `yunet_quantized.tflite` (~150 KB): YuNet face detector.
- `mobilefacenet_quant.tflite` (~1.9 MB): MobileFaceNet recognizer.
- `minifasnet_quant.tflite` (~1.0 MB): MiniFASNet passive liveness model.

*Refer to `models/README.md` for exact download instructions and conversion commands.*

### 3. Build and Run

```bash
npx react-native run-android
```
Alternatively, use the provided setup script from the project root:
```bash
python setup.py
```

## Security & Privacy Design

- **Zero Raw Data Retention:** The system extracts a 128-dimensional float array (512 bytes). Original images are processed in-memory and immediately discarded.
- **Encryption at Rest:** The SQLite database is fully encrypted via SQLCipher.
- **Secure Transit:** Synchronization utilizes HTTPS and requires an API key for the AWS Gateway.

## Performance Metrics

| Pipeline Stage | Average Latency | Target |
|---|---|---|
| Face Detection (YuNet) | 15 ms | < 100 ms |
| Recognition (MobileFaceNet) | 58 ms | < 300 ms |
| Liveness Validation (MiniFASNet) | 38 ms | < 300 ms |
| **Total End-to-End Latency** | **~125 ms** | **< 1.0 s** |

*Benchmarks recorded on a Motorola Edge 50 (Snapdragon 7s Gen 2). Note: Recognition and Liveness validation run concurrently via Kotlin Coroutines to minimize overall latency.*

## Known Setup Considerations

- **Missing Models Error:** If the app crashes on startup, verify that the three `.tflite` files are present in the `assets/` directory.
- **Camera Permissions:** The application requires explicit camera access. Ensure this is granted in the Android system settings.
- **NNAPI Fallback:** If the device's NPU/DSP does not support the delegate, the application will automatically fall back to CPU execution.

## License

This project is licensed under the MIT License. Developed specifically for the NHAI Hackathon 7.0.
