/**
 * FaceAuthBridge.ts  (v2)
 * TypeScript bridge for the Android FaceAuthModule native module.
 * Compatible with React Native 0.85 / New Architecture.
 */

import { NativeModules, Platform } from 'react-native';

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface FaceDetectionResult {
  faceFound: boolean;
  boundingBox?: number[];              // [x, y, w, h]
  embedding?: number[];               // 128-dim float
  livenessScore?: number;             // 0–1
  isLive?: boolean;                   // livenessScore >= 0.85
  meshLandmarks?: Array<{ x: number; y: number; z: number }>; // 468 pts
  ear?: number;                       // Eye Aspect Ratio
  mar?: number;                       // Mouth Aspect Ratio
  yawDeg?: number;                    // head yaw in degrees
  isBlinking?: boolean;
  isSmiling?: boolean;
  isTurned?: boolean;
  inferenceMs?: number;               // end-to-end latency
}

export interface EnrollResult {
  success: boolean;
  embedding?: number[];
  error?: string;
}

export interface ModelStatus {
  detector:   boolean;
  recognizer: boolean;
  liveness:   boolean;
  landmarks:  boolean;
}

// ─── Native Module Contract ──────────────────────────────────────────────────

interface FaceAuthNativeModule {
  initialize(): Promise<boolean>;
  getStatus(): Promise<ModelStatus>;
  processFrame(imagePath: string): Promise<FaceDetectionResult>;
  enrollFace(imagePath: string, personId: string): Promise<EnrollResult>;
}

// ─── Resolve Module ──────────────────────────────────────────────────────────

const NativeModule = NativeModules.FaceAuthModule as FaceAuthNativeModule | undefined;

if (!NativeModule) {
  console.warn(
    '[FaceAuthBridge] FaceAuthModule not found in NativeModules.\n' +
    'Make sure the app is rebuilt after adding the native module. Running in mock mode.',
  );
}

// ─── Mock for dev / metro-only testing ───────────────────────────────────────

const MockFaceAuth: FaceAuthNativeModule = {
  async initialize() {
    console.log('[FaceAuth MOCK] initialize');
    return true;
  },
  async getStatus() {
    return { detector: true, recognizer: true, liveness: true, landmarks: false };
  },
  async processFrame(_path: string) {
    // Simulate a real detection with random embedding
    await new Promise<void>(r => setTimeout(r, 80));
    return {
      faceFound:    true,
      boundingBox:  [100, 80, 200, 220],
      embedding:    Array.from({ length: 128 }, () => (Math.random() - 0.5) * 2),
      livenessScore: 0.91,
      isLive:       true,
      inferenceMs:  82,
    } as FaceDetectionResult;
  },
  async enrollFace(_path: string, _id: string) {
    await new Promise<void>(r => setTimeout(r, 60));
    return {
      success:   true,
      embedding: Array.from({ length: 128 }, () => (Math.random() - 0.5) * 2),
    } as EnrollResult;
  },
};

/**
 * FaceAuth — typed wrapper. Uses real native module when available,
 * falls back to mock in dev environments without the native build.
 */
export const FaceAuth: FaceAuthNativeModule = NativeModule ?? MockFaceAuth;

export default FaceAuth;
