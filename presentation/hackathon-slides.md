# Veraface — Hackathon Presentation Outline

## Slide 1: Title
- **Veraface** 
- Offline Biometric Attendance System
- Team Name / Members

## Slide 2: The Problem
- **Connectivity:** Remote construction/field sites lack reliable internet.
- **Fraud:** Buddy punching and proxy attendance cost millions.
- **Hardware constraints:** Existing systems require expensive dedicated biometric scanners.
- **Current solutions fail:** Cloud-based APIs are slow or timeout on 2G/3G edge networks.

## Slide 3: Our Solution
- A **100% Offline** Facial Recognition Engine.
- Runs purely on commodity Android smartphones (e.g., Motorola Edge 50).
- **Sub-second latency** (< 150ms total inference time).
- Works with zero network connectivity. 

## Slide 4: The Technology Stack
- **Framework:** React Native + VisionCamera v4 (zero-copy native frames)
- **AI Models:** 
  1. YuNet (Face Detection)
  2. MobileFaceNet (128-D Embedding Extraction)
  3. MiniFASNet (Passive Liveness / Anti-spoofing)
- **Geometry Tracking:** MediaPipe Face Mesh for Active Liveness
- **Hardware Acceleration:** Android NNAPI Delegate (Snapdragon NPU)

## Slide 5: Dual-Layer Liveness Detection
- **Layer 1: Passive (AI-based)**
  - MiniFASNet analyzes texture and lighting at multiple scales.
  - Rejects printed photos, masks, and screens instantly.
- **Layer 2: Active (Geometry-based)**
  - Randomized challenges (Blink, Smile, Turn Head).
  - Tracked via 468 MediaPipe facial landmarks (EAR/MAR metrics).

## Slide 6: Security & Privacy by Design
- **No Raw Images Stored:** We only store a 512-byte irreversible mathematical embedding.
- **Encrypted Storage:** Local SQLite database is encrypted with AES-256 via SQLCipher.
- **Secure Sync:** AWS API Gateway + Lambda with API Key Auth.
- **Auto-Purge:** Records are automatically deleted from the device 30 days after syncing.

## Slide 7: Astonishing Performance
- *Device:* Motorola Edge 50 (Snapdragon 7s Gen 2)
- **Model Footprint:** ~4.0 MB total (vs 20MB limit)
- **Latency:**
  - Detection: 15 ms
  - Recognition: 58 ms
  - Passive Liveness: 38 ms
  - **Total End-to-End: ~125 ms**
- **Accuracy:** > 98.4% on LFW dataset.

## Slide 8: Live Demo
- (Switch to screen mirroring)
- Show Enrollment process (fast, 5 frames).
- Show Airplane Mode is ON.
- Demonstrate fast successful login.
- Demonstrate spoof attempt (hold up a photo) -> Rejected.
- Demonstrate active challenge (Smile) -> Passed.

## Slide 9: Future Roadmap
- **iOS Support:** Port the Kotlin native module to Swift/CoreML.
- **Geofencing:** Lock attendance logging to specific GPS coordinates.
- **Edge Training:** On-device model fine-tuning for aging/facial hair changes.

## Slide 10: Conclusion
- Veraface proves that enterprise-grade, secure, and lightning-fast biometrics can run completely offline on everyday smartphones.
- Thank You! (Q&A)
