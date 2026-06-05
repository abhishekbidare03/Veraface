/**
 * FaceAuthService.ts  (v2)
 * Orchestrates the complete face recognition pipeline.
 * Handles both real native-module inference and mock/dev mode.
 */

import FaceAuth, { FaceDetectionResult } from '../native/FaceAuthBridge';
import db, { Person } from './DatabaseService';
import {
  base64ToEmbedding,
  embeddingToBase64,
  averageEmbeddings,
  findBestMatch,
  l2Normalize,
} from '../utils/embeddingUtils';
import {
  checkChallengeCompleted,
  getRandomChallenge,
  LivenessChallenge,
} from '../utils/livenessUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthSession {
  challenge: LivenessChallenge;
  challengeCompletedAt?: number;
  sessionStartedAt: number;
  timeoutMs: number;
}

export interface AuthResult {
  status: 'PASS' | 'FAIL' | 'NO_FACE' | 'SPOOF' | 'CHALLENGE_TIMEOUT' | 'NOT_ENROLLED';
  personId?: string;
  personName?: string;
  empId?: string;
  similarity?: number;
  livenessScore?: number;
  inferenceMs?: number;
  message: string;
}

export interface EnrollSessionResult {
  success: boolean;
  personId?: string;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PASSIVE_LIVENESS_THRESHOLD  = 0.85;
const RECOGNITION_THRESHOLD       = 0.65;
const CHALLENGE_TIMEOUT_MS        = 7000;
const MIN_ENROLL_FRAMES           = 3;
const TARGET_ENROLL_FRAMES        = 5;

// ─── In-memory person store ───────────────────────────────────────────────────
interface PersonWithVec extends Person {
  embeddingVec: number[];
}

// ─── FaceAuthService ──────────────────────────────────────────────────────────
class FaceAuthService {
  private persons: PersonWithVec[] = [];
  private initialized = false;

  // ─── Init ──────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    try {
      await FaceAuth.initialize();
    } catch (e) {
      console.warn('[FaceAuthService] Native init error (running in mock mode):', e);
    }
    await this.reloadPersons();
    this.initialized = true;
    console.log(`[FaceAuthService] Ready. ${this.persons.length} enrolled persons.`);
  }

  async reloadPersons(): Promise<void> {
    const rows = await db.getAllPersons();
    this.persons = rows.map(p => ({
      ...p,
      embeddingVec: base64ToEmbedding(p.embedding),
    }));
  }

  // ─── Session ────────────────────────────────────────────────────────────────

  createSession(): AuthSession {
    return {
      challenge:       getRandomChallenge(),
      sessionStartedAt: Date.now(),
      timeoutMs:       CHALLENGE_TIMEOUT_MS,
    };
  }

  // ─── processFrame ────────────────────────────────────────────────────────────

  /**
   * Run the full auth pipeline on a single camera frame.
   *
   * @param imagePath      Path to JPEG captured by VisionCamera
   * @param session        Current auth session (mutable — challenge state updated)
   * @param onChallengeComplete  Called when active liveness challenge is satisfied
   */
  async processFrame(
    imagePath: string,
    session: AuthSession,
    onChallengeComplete?: () => void,
  ): Promise<AuthResult> {

    // 1. Session timeout gate
    const elapsed = Date.now() - session.sessionStartedAt;
    if (elapsed > session.timeoutMs && !session.challengeCompletedAt) {
      return { status: 'CHALLENGE_TIMEOUT', message: 'Liveness challenge timed out. Please retry.' };
    }

    // 2. Native inference
    let detection: FaceDetectionResult;
    try {
      detection = await FaceAuth.processFrame(imagePath);
    } catch (err) {
      return { status: 'FAIL', message: `Inference error: ${String(err)}` };
    }

    // 3. Face gate
    if (!detection.faceFound || !detection.embedding) {
      return { status: 'NO_FACE', message: 'No face detected — center your face in the oval.' };
    }

    // 4. Passive liveness gate
    const livenessScore = detection.livenessScore ?? 0;
    if (livenessScore < PASSIVE_LIVENESS_THRESHOLD) {
      return {
        status: 'SPOOF',
        livenessScore,
        message: `Anti-spoof rejected (score ${(livenessScore * 100).toFixed(0)}%). Use your real face.`,
      };
    }

    // 5. Active liveness check (geometry from native landmarks OR JS fallback)
    if (!session.challengeCompletedAt) {
      let completed = false;

      if (detection.meshLandmarks && detection.meshLandmarks.length >= 400) {
        // Native MediaPipe landmarks available
        completed = checkChallengeCompleted(session.challenge, detection.meshLandmarks);
      } else if (detection.isBlinking !== undefined) {
        // Native computed metrics available (faster path)
        switch (session.challenge) {
          case 'BLINK':      completed = detection.isBlinking ?? false; break;
          case 'SMILE':      completed = detection.isSmiling  ?? false; break;
          case 'TURN_LEFT':  completed = (detection.yawDeg ?? 0) < -15; break;
          case 'TURN_RIGHT': completed = (detection.yawDeg ?? 0) > 15;  break;
        }
      }

      if (completed) {
        session.challengeCompletedAt = Date.now();
        onChallengeComplete?.();
      }
    }

    // 6. Face recognition
    const queryVec = l2Normalize([...detection.embedding]);
    const match = findBestMatch(queryVec, this.persons.map(p => ({
      id: p.id, name: p.name, emp_id: p.emp_id, embedding: p.embeddingVec,
    })));

    if (!match) {
      return {
        status: 'NOT_ENROLLED',
        livenessScore,
        inferenceMs: detection.inferenceMs,
        message: 'Face not recognized. Please enroll first.',
      };
    }

    // 7. Waiting for challenge completion
    if (!session.challengeCompletedAt) {
      return {
        status: 'FAIL',
        personId: match.id, personName: match.name, empId: match.empId,
        similarity: match.similarity, livenessScore,
        inferenceMs: detection.inferenceMs,
        message: `Identity confirmed — complete the liveness challenge.`,
      };
    }

    // 8. ALL CHECKS PASSED ✅
    return {
      status: 'PASS',
      personId: match.id,
      personName: match.name,
      empId: match.empId,
      similarity: match.similarity,
      livenessScore,
      inferenceMs: detection.inferenceMs,
      message: `Access granted — Welcome, ${match.name}!`,
    };
  }

  // ─── Enrollment ───────────────────────────────────────────────────────────

  /**
   * Enroll a new person from multiple frame paths.
   * Averages embeddings from all successful frames.
   */
  async enrollPerson(
    framePaths: string[],
    name: string,
    empId: string,
  ): Promise<EnrollSessionResult> {

    const embeddings: number[][] = [];

    for (const path of framePaths) {
      try {
        const tempId = 'enroll_temp';
        const result = await FaceAuth.enrollFace(path, tempId);
        if (result.success && result.embedding && result.embedding.length === 128) {
          embeddings.push(l2Normalize([...result.embedding]));
        }
      } catch (e) {
        console.warn('[FaceAuthService] enroll frame error:', e);
      }
    }

    if (embeddings.length < MIN_ENROLL_FRAMES) {
      return {
        success: false,
        error: `Only ${embeddings.length}/${TARGET_ENROLL_FRAMES} frames had valid faces. ` +
               'Ensure good lighting and hold still.',
      };
    }

    const avgEmb   = averageEmbeddings(embeddings);
    const personId = this.generateUUID();

    await db.enrollPerson({
      id:        personId,
      name:      name.trim(),
      emp_id:    empId.trim(),
      embedding: embeddingToBase64(avgEmb),
    });

    await this.reloadPersons();
    console.log(`[FaceAuthService] Enrolled "${name}" (${personId}) from ${embeddings.length} frames`);

    return { success: true, personId };
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  get enrolledCount(): number {
    return this.persons.length;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private generateUUID(): string {
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `${h()}${h()}-${h()}-4${h().slice(1)}-${(['8','9','a','b'])[Math.floor(Math.random()*4)]}${h().slice(1)}-${h()}${h()}${h()}`;
  }
}

export const faceAuthService = new FaceAuthService();
export default faceAuthService;
