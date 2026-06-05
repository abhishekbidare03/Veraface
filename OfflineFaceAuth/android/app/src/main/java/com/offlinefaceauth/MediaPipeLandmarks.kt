package com.offlinefaceauth

import android.content.res.AssetManager
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.nnapi.NnApiDelegate
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.math.*

/**
 * MediaPipeLandmarks.kt
 *
 * Wraps MediaPipe Face Mesh (or a lightweight equivalent) for active liveness geometry.
 * Since bundling the full MediaPipe SDK adds ~20 MB, we use a lightweight 468-landmark
 * TFLite face mesh model (face_landmarks_detector.tflite from MediaPipe tasks).
 *
 * For the hackathon demo we compute:
 *   - EAR (Eye Aspect Ratio) → blink detection
 *   - MAR (Mouth Aspect Ratio) → smile detection
 *   - Yaw angle from ear asymmetry → head turn detection
 *
 * Model: face_mesh_front_ops16.tflite  (~2 MB, MediaPipe open source)
 * Input:  [1, 192, 192, 3]
 * Output: [1, 1404] → 468 landmarks × 3 coordinates (x, y, z), normalized [0,1]
 */
class MediaPipeLandmarks(assets: AssetManager) : TFLiteRunner(assets, "face_mesh_front_ops16.tflite", useNNAPI = false) {

    companion object {
        const val INPUT_SIZE = 192
        const val NUM_LANDMARKS = 468
        const val OUTPUT_SIZE = NUM_LANDMARKS * 3  // 1404

        // ── MediaPipe landmark indices ──────────────────────────────────────
        // RIGHT eye (from user's left, camera's right): p1,p2,p3,p4,p5,p6
        val RIGHT_EYE = intArrayOf(33, 160, 158, 133, 153, 144)
        // LEFT eye
        val LEFT_EYE  = intArrayOf(362, 385, 387, 263, 373, 380)
        // Mouth
        const val MOUTH_LEFT    = 61
        const val MOUTH_RIGHT   = 291
        const val MOUTH_TOP     = 13
        const val MOUTH_BOTTOM  = 14
        // Head yaw references
        const val NOSE_TIP      = 1
        const val LEFT_EAR_PT   = 234
        const val RIGHT_EAR_PT  = 454

        // Thresholds
        const val EAR_BLINK_THRESHOLD = 0.25f
        const val MAR_SMILE_THRESHOLD = 1.8f
        const val YAW_THRESHOLD_DEG   = 15f
    }

    data class LandmarkResult(
        val found: Boolean,
        /** 468 × [x, y, z] in [0,1] range */
        val landmarks: Array<FloatArray>? = null,
        val ear: Float = 0f,
        val mar: Float = 0f,
        val yawDeg: Float = 0f,
        val isBlinking: Boolean = false,
        val isSmiling: Boolean = false,
        val isTurned: Boolean = false,
    )

    /**
     * Detect facial landmarks from an aligned face crop (any size — we scale internally).
     * Returns landmark geometry and derived liveness metrics.
     */
    fun detect(faceBitmap: Bitmap): LandmarkResult {
        val input = bitmapToByteBuffer(faceBitmap, INPUT_SIZE, INPUT_SIZE, mean = 128f, std = 128f)

        // Output: [1, 1404]
        val output = Array(1) { FloatArray(OUTPUT_SIZE) }
        interpreter.run(input, output)

        val flat = output[0]

        // Reshape to [468][3]
        val landmarks = Array(NUM_LANDMARKS) { i ->
            floatArrayOf(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2])
        }

        // Compute metrics
        val ear  = computeEAR(landmarks)
        val mar  = computeMAR(landmarks)
        val yaw  = computeYaw(landmarks)

        return LandmarkResult(
            found      = true,
            landmarks  = landmarks,
            ear        = ear,
            mar        = mar,
            yawDeg     = yaw,
            isBlinking = ear < EAR_BLINK_THRESHOLD,
            isSmiling  = mar > MAR_SMILE_THRESHOLD,
            isTurned   = abs(yaw) > YAW_THRESHOLD_DEG,
        )
    }

    // ── EAR ─────────────────────────────────────────────────────────────────

    private fun computeEAR(lm: Array<FloatArray>): Float {
        val earRight = eyeAspectRatio(RIGHT_EYE.map { lm[it] })
        val earLeft  = eyeAspectRatio(LEFT_EYE.map  { lm[it] })
        return (earRight + earLeft) / 2f
    }

    private fun eyeAspectRatio(pts: List<FloatArray>): Float {
        val (p1, p2, p3, p4, p5, p6) = pts
        val vertical   = dist(p2, p6) + dist(p3, p5)
        val horizontal = 2f * dist(p1, p4)
        return if (horizontal == 0f) 0f else vertical / horizontal
    }

    // ── MAR ─────────────────────────────────────────────────────────────────

    private fun computeMAR(lm: Array<FloatArray>): Float {
        val width  = dist(lm[MOUTH_LEFT], lm[MOUTH_RIGHT])
        val height = dist(lm[MOUTH_TOP],  lm[MOUTH_BOTTOM])
        return if (height == 0f) 0f else width / height
    }

    // ── Yaw ──────────────────────────────────────────────────────────────────

    private fun computeYaw(lm: Array<FloatArray>): Float {
        val nose  = lm[NOSE_TIP]
        val left  = lm[LEFT_EAR_PT]
        val right = lm[RIGHT_EAR_PT]
        val dLeft  = dist(nose, left)
        val dRight = dist(nose, right)
        val total  = dLeft + dRight
        if (total == 0f) return 0f
        val asymmetry = (dRight - dLeft) / total
        return asymmetry * 90f   // approximate degrees
    }

    // ── Utilities ────────────────────────────────────────────────────────────

    private fun dist(a: FloatArray, b: FloatArray): Float {
        val dx = a[0] - b[0]; val dy = a[1] - b[1]
        return sqrt(dx * dx + dy * dy)
    }
}
