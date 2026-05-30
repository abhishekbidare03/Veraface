# Veraface 🛡️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-React--Native-blue.svg)](https://reactnative.dev/)
[![Size](https://img.shields.io/badge/Model%20Size-~4%20MB-success.svg)](#)
[![Inference Speed](https://img.shields.io/badge/Inference%20Speed-%3C150ms-brightgreen.svg)](#)

An ultra-lightweight, fully offline facial recognition and dual-layer liveness detection system designed for React Native. Built to provide secure, sub-second personnel authentication in zero-network remote zones, with a robust offline-to-online sync and purge mechanism.

This project was developed for **Hackathon 7.0 (Problem Statement: Secure Offline Facial Authentication)**.

---

## 📖 Table of Contents
1. [Key Features](#-key-features)
2. [Target Performance & Benchmarks](#-target-performance--benchmarks)
3. [Architecture Overview](#-architecture-overview)
4. [AI Model Pipeline](#-ai-model-pipeline)
5. [Repository Structure](#-repository-structure)
6. [Prerequisites & Setup](#-prerequisites--setup)
7. [Sync & Purge Lifecycle](#-sync--purge-lifecycle)
8. [License](#-license)

---

## ✨ Key Features

*   **100% Offline Core:** Face detection, facial alignment, embedding extraction, and matching all run strictly on-device. No internet connection required.
*   **Dual-Layer Spoof Prevention:**
    *   *Passive Liveness (Silent):* **MiniFASNet** scans the frame instantly to detect paper photos, digital screens, or 3D masks.
    *   *Active Liveness (Challenge-Response):* Dynamic, randomized challenges (e.g., blink, smile, head rotation) computed using geometrical landmarks via **MediaPipe Face Mesh**.
*   **Hardware-Accelerated Speed:** Leverages Android **NNAPI** (Neural Networks API) and iOS **CoreML** via native Android/iOS bridges to run models at neural-processing speeds.
*   **Secure Local Storage:** Biometric templates (128-D float embeddings) are stored in an encrypted SQLCipher database on the device. **Raw faces are never saved.**
*   **Online Sync & Automatic Purge:** Logs attendance records locally. Automatically detects internet restoration, synchronizes batches securely with AWS, and purges synced records to comply with data privacy policies.

---

## 📊 Target Performance & Benchmarks

Optimized for mid-range edge hardware (e.g., Motorola Edge 50 / Snapdragon 7s Gen 2):

| Metric | Target | Actual (Projected) |
|---|---|---|
| **Total Model Footprint** | < 20 MB | **~4.0 MB** (INT8 Quantized) |
| **Detection Speed (YuNet)** | < 100 ms | **~15 ms** |
| **Recognition Speed (MobileFaceNet)** | < 300 ms | **~60 ms** |
| **Liveness Verification (MiniFASNet)** | < 300 ms | **~40 ms** |
| **Total End-to-End Latency** | **< 1.0 Second** | **~125 - 150 ms** |
| **Recognition Accuracy** | > 95% | **> 98.4% (LFW Dataset)** |

---

## 🏗️ Architecture Overview

```
                      ┌─────────────────── React Native App ─────────────────────┐
                      │                                                           │
                      │  ┌──────────────┐   ┌──────────────────────────────────┐ │
                      │  │  Camera View │──▶│     Native Module Bridge         │ │
                      │  │  (Expo/RN)   │   │  (Android: Kotlin / iOS: Swift)  │ │
                      │  └──────────────┘   └──────────┬───────────────────────┘ │
                      │                                │                          │
                      │                    ┌───────────▼──────────────┐           │
                      │                    │   On-Device Inference     │           │
                      │                    │  ┌────────────────────┐  │           │
                      │                    │  │ Face Detection     │  │           │
                      │                    │  │ (YuNet / BlazeFace)│  │           │
                      │                    │  └────────┬───────────┘  │           │
                      │                    │          │               │           │
                      │                    │  ┌───────▼────────────┐  │           │
                      │                    │  │ Face Recognition   │  │           │
                      │                    │  │ (MobileFaceNet)    │  │           │
                      │                    │  └────────┬───────────┘  │           │
                      │                    │          │               │           │
                      │                    │  ┌───────▼────────────┐  │           │
                      │                    │  │ Liveness Detection │  │           │
                      │                    │  │ (MiniVGG + rules)  │  │           │
                      │                    │  └────────────────────┘  │           │
                      │                    └──────────────────────────┘           │
                      │                                                           │
                      │  ┌────────────────────────────────────────────────────┐   │
                      │  │            Local SQLite / AsyncStorage             │   │
                      │  │   (face embeddings + attendance logs + sync queue) │   │
                      │  └───────────────────┬────────────────────────────────┘   │
                      │                      │ when online                        │
                      │                      ▼                                    │
                      │             AWS Lambda / S3 Sync                          │
                      └───────────────────────────────────────────────────────────┘
```

---

## 🤖 AI Model Pipeline

```
[ Camera Stream Frame ]
           │
           ▼
[ YuNet Detector ] ── (No Face) ──▶ [ Prompt: Center your face ]
           │
      (Face Found)
           ▼
[ Affine Alignment & Crop ] ──▶ (Outputs aligned 112x112 Face Crop)
           │
           ├───────────────────────────────┐
           ▼                               ▼
[ MobileFaceNet (Recognize) ]    [ MiniFASNet (Passive Liveness) ]
  Generates 128-D Embedding        Outputs Spoof/Real Probability
           │                               │
           ▼                               ▼
[ Cosine Similarity Match ]       [ Real Score >= 0.85? ]
  Matches SQLite registry                  │
           │                               ▼
           │                       [ Active Challenges ]
           │                         (Blink, Smile, Turn)
           │                               │
           └──────────────┬────────────────┘
                          ▼
             [ Combined Decision Score ]
                          │
                  (PASS Liveness + ID)
                          ▼
            [ Attendance Logged in SQLite ]
```

---

## 📂 Repository Structure

```
SentryEdge/
├── android/                         # Native Android Gradle configuration and modules
│   └── app/src/main/java/com/sentryedge/
│       ├── FaceAuthModule.kt        # JSI Native React Native module
│       ├── YuNetDetector.kt         # TFLite Wrapper for Face Detection
│       ├── MobileFaceNet.kt         # TFLite Wrapper for Face Embeddings
│       └── LivenessDetector.kt      # Passive FAS & Active Landmark geometry
├── ios/                             # Native iOS project structure (Swift/ObjC)
├── models/                          # Bundled INT8 quantized models
│   ├── yunet_quantized.tflite       # Face detection (~150 KB)
│   ├── mobilefacenet_quant.tflite   # Facial embedding extractor (~1.9 MB)
│   └── minifasnet_quant.tflite      # Passive anti-spoofing (~1.0 MB)
├── src/                             # React Native Source Code
│   ├── components/                  # UI Custom Camera, Overlay, and Challenges
│   ├── navigation/                  # React Navigation container
│   ├── screens/                     # Auth, Enroll, Logs, & Setting Screens
│   ├── services/                    # SQLite Database Service & AWS Sync Service
│   └── utils/                       # Vector calculations (Cosine Sim, EAR, MAR)
├── docs/                            # Detailed integration & benchmark documentation
├── README.md                        # Project layout & documentation
└── package.json                     # Node dependencies
```

---

## ⚙️ Prerequisites & Setup

### Requirements
*   **Node.js** >= 18
*   **Android Studio** with Android SDK 8.0 (API 26) or higher
*   **Xcode** >= 14 (for iOS builds)
*   **Cocoapods** (for iOS dependency linking)

### Native Setup & Model Placement
Download and place the quantized `.tflite` model files in their respective assets directories:
*   **Android:** Place in `android/app/src/main/assets/`
*   **iOS:** Add to Xcode Project resources bundle.

### Build and Run

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/your-username/sentryedge.git
    cd sentryedge
    ```
2.  **Install Node Modules:**
    ```bash
    npm install
    ```
3.  **Run on Android:**
    ```bash
    npx react-native run-android
    ```
4.  **Run on iOS:**
    ```bash
    cd ios && pod install && cd ..
    npx react-native run-ios
    ```

---

## 🔄 Sync & Purge Lifecycle

1.  **Queue Stage:** Every offline biometric transaction logs a packet to the device's SQLCipher database containing `{ person_id, timestamp, liveness_score, location_coordinates, status: 'synced_pending' }`.
2.  **Network Probe:** A persistent background listener monitors connection status using `@react-native-community/netinfo`.
3.  **Batch Sync:** When an active internet connection is detected, the `SyncService` bundles unsynced transactions and sends them securely via HTTPS post request to an AWS Lambda API endpoint.
4.  **Purge Trigger:** Upon receiving an HTTP `200 OK` confirmation, local transaction rows are updated to `synced_complete`. Privacy configurations automatically purge database logs that are older than 30 days.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. Contains open-source components from OpenCV, TensorFlow Lite, and MediaPipe.
