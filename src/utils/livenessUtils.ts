/**
 * livenessUtils.ts  (v2)
 * Geometry-based active liveness detection from 468 MediaPipe face landmarks.
 * Works with both native (MediaPipeLandmarks.kt) and JS landmark arrays.
 */

// ─── Challenge Types ──────────────────────────────────────────────────────────

export type LivenessChallenge = 'BLINK' | 'SMILE' | 'TURN_LEFT' | 'TURN_RIGHT';

export const CHALLENGE_LABELS: Record<LivenessChallenge, string> = {
  BLINK:      'Please BLINK your eyes',
  SMILE:      'Please SMILE',
  TURN_LEFT:  'Please turn your head LEFT',
  TURN_RIGHT: 'Please turn your head RIGHT',
};

export function getRandomChallenge(): LivenessChallenge {
  const all: LivenessChallenge[] = ['BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT'];
  return all[Math.floor(Math.random() * all.length)];
}

// ─── Landmark Geometry ────────────────────────────────────────────────────────

/** MediaPipe Face Mesh landmark indices */
const RIGHT_EYE_PTS = [33, 160, 158, 133, 153, 144] as const;
const LEFT_EYE_PTS  = [362, 385, 387, 263, 373, 380] as const;
const MOUTH_LEFT    = 61;
const MOUTH_RIGHT   = 291;
const MOUTH_TOP     = 13;
const MOUTH_BOTTOM  = 14;
const NOSE_TIP      = 1;
const LEFT_EAR_PT   = 234;
const RIGHT_EAR_PT  = 454;

// Thresholds
const EAR_BLINK_THRESHOLD = 0.25;
const MAR_SMILE_THRESHOLD = 1.8;
const YAW_THRESHOLD_DEG   = 15;

type Point3D = { x: number; y: number; z: number };
type Point2D = [number, number];

function dist2D(a: Point3D | Point2D, b: Point3D | Point2D): number {
  if (Array.isArray(a)) {
    const dx = (a[0]) - (b as Point2D)[0];
    const dy = (a[1]) - (b as Point2D)[1];
    return Math.sqrt(dx * dx + dy * dy);
  }
  const dx = (a as Point3D).x - (b as Point3D).x;
  const dy = (a as Point3D).y - (b as Point3D).y;
  return Math.sqrt(dx * dx + dy * dy);
}

function eyeAspectRatio(pts: Point3D[]): number {
  const [p1, p2, p3, p4, p5, p6] = pts;
  const vert   = dist2D(p2, p6) + dist2D(p3, p5);
  const horiz  = 2 * dist2D(p1, p4);
  return horiz === 0 ? 0 : vert / horiz;
}

// ─── Metric Computations ──────────────────────────────────────────────────────

export function computeEAR(landmarks: Point3D[]): number {
  if (landmarks.length < 400) return 0.3; // fallback — assume open
  const rEAR = eyeAspectRatio(RIGHT_EYE_PTS.map(i => landmarks[i]));
  const lEAR = eyeAspectRatio(LEFT_EYE_PTS.map(i => landmarks[i]));
  return (rEAR + lEAR) / 2;
}

export function computeMAR(landmarks: Point3D[]): number {
  if (landmarks.length < 300) return 0;
  const width  = dist2D(landmarks[MOUTH_LEFT], landmarks[MOUTH_RIGHT]);
  const height = dist2D(landmarks[MOUTH_TOP],  landmarks[MOUTH_BOTTOM]);
  return height === 0 ? 0 : width / height;
}

export function computeYawDegrees(landmarks: Point3D[]): number {
  if (landmarks.length < 460) return 0;
  const nose  = landmarks[NOSE_TIP];
  const left  = landmarks[LEFT_EAR_PT];
  const right = landmarks[RIGHT_EAR_PT];
  const dL = dist2D(nose, left);
  const dR = dist2D(nose, right);
  const total = dL + dR;
  if (total === 0) return 0;
  const asymmetry = (dR - dL) / total;
  return asymmetry * 90;  // approximate degrees
}

// ─── Challenge Check ──────────────────────────────────────────────────────────

/**
 * Check if a liveness challenge has been satisfied by current landmark geometry.
 * Called per-frame during an active session.
 */
export function checkChallengeCompleted(
  challenge: LivenessChallenge,
  landmarks: Point3D[],
): boolean {
  switch (challenge) {
    case 'BLINK':
      return computeEAR(landmarks) < EAR_BLINK_THRESHOLD;
    case 'SMILE':
      return computeMAR(landmarks) > MAR_SMILE_THRESHOLD;
    case 'TURN_LEFT':
      return computeYawDegrees(landmarks) < -YAW_THRESHOLD_DEG;
    case 'TURN_RIGHT':
      return computeYawDegrees(landmarks) > YAW_THRESHOLD_DEG;
    default:
      return false;
  }
}
