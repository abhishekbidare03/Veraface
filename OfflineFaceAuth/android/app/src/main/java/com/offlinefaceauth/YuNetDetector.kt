package com.offlinefaceauth

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.Matrix
import kotlin.math.sqrt

/**
 * YuNetDetector.kt
 * Wraps the YuNet INT8 TFLite model for face detection.
 *
 * Model: yunet_quantized.tflite (~150 KB)
 * Input:  [1, 160, 120, 3] — BGR or RGB depending on export
 * Output: [1, N, 15] — bounding boxes + 5 landmark pairs + confidence
 *
 * Reference: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
 */
class YuNetDetector(assets: AssetManager) : TFLiteRunner(assets, "yunet_quantized.tflite") {

    companion object {
        const val INPUT_W = 160
        const val INPUT_H = 120
        const val CONF_THRESHOLD = 0.7f
        const val FACE_CROP_SIZE = 112
        // Output: [boxes, landmarks, confidence] per detection
        const val OUTPUT_SIZE = 15  // x,y,w,h + 5 landmarks (10 values) + conf
    }

    data class DetectionResult(
        val faceFound: Boolean,
        /** [x, y, width, height] in input image coordinates */
        val boundingBox: FloatArray? = null,
        /** 5 x [x, y] facial landmarks in input image coordinates */
        val landmarks: Array<FloatArray>? = null,
        val confidence: Float = 0f,
    )

    /**
     * Run face detection on a bitmap.
     * Returns the highest-confidence detection above threshold.
     */
    fun detect(bitmap: Bitmap): DetectionResult {
        val input = bitmapToByteBuffer(bitmap, INPUT_W, INPUT_H, mean = 0f, std = 1f)

        // YuNet output shape: [1, num_detections, 15]
        // We allocate for max 200 detections
        val numDetections = 200
        val output = Array(1) { Array(numDetections) { FloatArray(OUTPUT_SIZE) } }

        interpreter.run(input, output)

        var bestConf = CONF_THRESHOLD
        var bestDetection: DetectionResult? = null

        for (det in output[0]) {
            val conf = det[14]
            if (conf > bestConf) {
                bestConf = conf

                // Scale back to original image coordinates
                val scaleX = bitmap.width.toFloat() / INPUT_W
                val scaleY = bitmap.height.toFloat() / INPUT_H

                val x = det[0] * scaleX
                val y = det[1] * scaleY
                val w = det[2] * scaleX
                val h = det[3] * scaleY

                val landmarks = Array(5) { i ->
                    floatArrayOf(det[4 + i * 2] * scaleX, det[5 + i * 2] * scaleY)
                }

                bestDetection = DetectionResult(
                    faceFound = true,
                    boundingBox = floatArrayOf(x, y, w, h),
                    landmarks = landmarks,
                    confidence = conf,
                )
            }
        }

        return bestDetection ?: DetectionResult(faceFound = false)
    }

    /**
     * Perform affine alignment using the 5 facial landmarks.
     * Returns a 112×112 RGB face crop, normalized for MobileFaceNet.
     *
     * The target landmark positions are the ArcFace/InsightFace canonical points.
     */
    fun getAlignedFace(bitmap: Bitmap, detection: DetectionResult): Bitmap? {
        val landmarks = detection.landmarks ?: return null

        // ArcFace canonical 112x112 landmark positions
        val dst = arrayOf(
            floatArrayOf(38.2946f, 51.6963f),   // left eye
            floatArrayOf(73.5318f, 51.5014f),   // right eye
            floatArrayOf(56.0252f, 71.7366f),   // nose
            floatArrayOf(41.5493f, 92.3655f),   // left mouth
            floatArrayOf(70.7299f, 92.2041f),   // right mouth
        )

        // Compute similarity transform (scale + rotation + translation)
        val matrix = computeSimilarityTransform(landmarks, dst)

        // Apply transform to get aligned 112x112 face
        val androidMatrix = Matrix()
        androidMatrix.setValues(floatArrayOf(
            matrix[0], matrix[1], matrix[2],
            matrix[3], matrix[4], matrix[5],
            0f, 0f, 1f,
        ))

        return try {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, androidMatrix, true)
                .let { Bitmap.createScaledBitmap(it, FACE_CROP_SIZE, FACE_CROP_SIZE, true) }
        } catch (e: Exception) {
            // Fallback: just crop and scale the bounding box region
            val box = detection.boundingBox ?: return null
            val cropped = Bitmap.createBitmap(
                bitmap,
                box[0].toInt().coerceAtLeast(0),
                box[1].toInt().coerceAtLeast(0),
                box[2].toInt().coerceAtMost(bitmap.width - box[0].toInt()),
                box[3].toInt().coerceAtMost(bitmap.height - box[1].toInt()),
            )
            Bitmap.createScaledBitmap(cropped, FACE_CROP_SIZE, FACE_CROP_SIZE, true)
        }
    }

    /**
     * Compute a 2×3 similarity transform matrix mapping src landmarks to dst.
     * Simplified version using mean + scale estimation.
     */
    private fun computeSimilarityTransform(
        src: Array<FloatArray>,
        dst: Array<FloatArray>,
    ): FloatArray {
        val n = src.size.toFloat()

        // Compute centroids
        var srcMeanX = 0f; var srcMeanY = 0f
        var dstMeanX = 0f; var dstMeanY = 0f
        for (i in src.indices) {
            srcMeanX += src[i][0]; srcMeanY += src[i][1]
            dstMeanX += dst[i][0]; dstMeanY += dst[i][1]
        }
        srcMeanX /= n; srcMeanY /= n
        dstMeanX /= n; dstMeanY /= n

        // Compute scale
        var srcVar = 0f
        for (pt in src) {
            srcVar += (pt[0] - srcMeanX).let { it * it } + (pt[1] - srcMeanY).let { it * it }
        }
        srcVar /= n

        // Compute a, b for similarity transform [a -b; b a]
        var a = 0f; var b = 0f
        for (i in src.indices) {
            val sx = src[i][0] - srcMeanX; val sy = src[i][1] - srcMeanY
            val dx = dst[i][0] - dstMeanX; val dy = dst[i][1] - dstMeanY
            a += sx * dx + sy * dy
            b += sx * dy - sy * dx
        }
        if (srcVar > 0) {
            a /= srcVar * n
            b /= srcVar * n
        }

        val tx = dstMeanX - a * srcMeanX + b * srcMeanY
        val ty = dstMeanY - b * srcMeanX - a * srcMeanY

        // Return as flat [a, -b, tx, b, a, ty]
        return floatArrayOf(a, -b, tx, b, a, ty)
    }
}
