# Architecture Deep-Dive

## System Overview

Veraface is a 100% offline biometric authentication system built on React Native (bare CLI). The system performs personnel identification using a 3-stage AI pipeline, all running on-device using TFLite with NNAPI hardware acceleration.

## AI Model Pipeline

```
Camera Frame (720p @ 30fps)
       │
       ▼
[1] YuNet Face Detector (INT8, ~150KB)
    ├── Input:  [1, 160, 120, 3] BGR image
    ├── Output: bounding box + 5 facial landmarks + confidence score
    └── Threshold: confidence ≥ 0.70
       │
  (Face Found)
       │
       ▼
[2] Affine Alignment → 112×112 Face Crop
    ├── Uses 5 landmarks from YuNet
    ├── Target: ArcFace canonical landmark positions
    └── Output: precisely aligned 112×112 RGB face crop
       │
       ├──────────────────────────────────┐
       ▼                                  ▼
[3a] MobileFaceNet (INT8, ~1.9MB)   [3b] MiniFASNet (INT8, ~1.0MB)
    ├── Input: [1, 112, 112, 3]          ├── Input: [1, 80, 80, 3]
    ├── Normalized to [-1, 1]            ├── Multi-scale prediction
    ├── Output: float[128] embedding     ├── Output: [background, real, spoof]
    └── L2-normalized                   └── Threshold: real_prob ≥ 0.85
       │                                  │
       ▼                                  ▼
[4] Cosine Similarity Match         Passive Liveness Gate
    ├── Matches vs all stored            ├── PASS → continue
    ├── embeddings in SQLite DB          └── FAIL → "Spoof detected"
    └── Threshold: sim ≥ 0.65
       │
       ▼
[5] MediaPipe Active Challenge (geometry only, no extra model)
    ├── Challenge types: BLINK / SMILE / TURN_LEFT / TURN_RIGHT
    ├── BLINK: EAR = (|p2-p6| + |p3-p5|) / (2·|p1-p4|) < 0.25
    ├── SMILE: MAR = mouth_width / mouth_height > 1.8
    ├── TURN:  Yaw angle from ear asymmetry > 15°
    └── Timeout: 7 seconds
       │
       ▼
[6] Combined Decision Engine
    ├── PASS: Recognized AND PassiveLiveness=REAL AND ActiveChallenge=DONE
    └── FAIL: Any condition not met
       │
       ▼
[7] Attendance Logging (SQLite + Encryption)
    ├── person_id, timestamp, confidence, liveness_score
    ├── GPS coordinates (lat/lon)
    └── synced=0 (queued for AWS sync)
```

## Hardware Acceleration

| Delegate | Speedup | Availability |
|---|---|---|
| **NNAPI** | ~3–5× | Android 8.1+, Snapdragon 7s Gen 2 |
| GPU | ~2–3× | Requires GPU delegate (optional) |
| CPU (fallback) | 1× | All devices |

The app automatically falls back from NNAPI → CPU if the delegate is unavailable.

## Security Architecture

### Data Flow
```
Camera Pixel Data
      │
      ▼ (never stored)
Face Detection + Alignment
      │
      ▼ (never stored)
128-dim Float Embedding (irreversible)
      │
      ▼ (stored encrypted)
SQLCipher AES-256 Database
      │  (when online)
      ▼
AWS Lambda + S3 (HTTPS + x-api-key)
```

### Key Principles
1. **No raw face storage**: Only the 512-byte mathematical embedding is persisted
2. **Encrypted at rest**: SQLCipher AES-256 with Android Keystore-derived key
3. **Encrypted in transit**: HTTPS to AWS API Gateway
4. **Auto-purge**: Records older than 30 days are deleted after successful sync

## Database Schema

```sql
-- Biometric registry (enrollment data)
CREATE TABLE persons (
  id          TEXT PRIMARY KEY,     -- UUID v4
  name        TEXT NOT NULL,
  emp_id      TEXT UNIQUE,          -- Employee ID (e.g. "EMP-2024-001")
  embedding   BLOB,                  -- 128 × float32 = 512 bytes, base64
  enrolled_at INTEGER               -- Unix ms timestamp
);

-- Attendance log (sync queue)
CREATE TABLE attendance_log (
  id          TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
  person_id   TEXT REFERENCES persons(id),
  timestamp   INTEGER NOT NULL,     -- Unix ms
  confidence  REAL,                 -- Cosine similarity score [0-1]
  liveness_ok INTEGER,              -- 0/1 boolean
  lat         REAL,                 -- GPS latitude
  lon         REAL,                 -- GPS longitude
  synced      INTEGER DEFAULT 0     -- 0=pending, 1=synced to AWS
);

CREATE INDEX idx_attendance_synced ON attendance_log(synced);
```

## AWS Sync Architecture

```
Device (Offline)                    AWS Cloud
┌─────────────────────┐            ┌──────────────────────────┐
│  attendance_log     │            │  API Gateway             │
│  (synced=0)         │            │  POST /attendance        │
│         │           │            │  x-api-key: ***          │
│         ▼           │  HTTPS     │         │                │
│  SyncService        │ ─────────▶ │  Lambda Function         │
│  (batch of ≤100)    │            │  (validate + store)      │
│         │           │            │         │                │
│  NetInfo detects    │            │  S3 Bucket               │
│  connectivity       │ ◀───────── │  (attendance records)    │
│  restored           │   200 OK   │                          │
│         │           │            └──────────────────────────┘
│  Mark synced=1      │
│  Purge >30 days     │
└─────────────────────┘
```

### Retry Logic
- Max 3 retries with exponential backoff (2s, 4s, 6s)
- Batch size: 100 records per POST
- Triggered: on network reconnect (NetInfo) + manual sync button
