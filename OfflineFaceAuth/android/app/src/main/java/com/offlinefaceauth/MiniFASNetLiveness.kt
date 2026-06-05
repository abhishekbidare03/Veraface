package com.offlinefaceauth

import android.content.res.AssetManager
import android.graphics.Bitmap

/**
 * MiniFASNetLiveness.kt
 * Wraps the MiniFASNet INT8 TFLite model for passive anti-spoofing.
 *
 * Model: minifasnet_quant.tflite (~1.0 MB)
 * Input:  Two scales of the face crop:
 *           scale1: [1, 80,  80,  3] at 2.7× scale
 *           scale2: [1, 80, 80, 3] at 4.0× scale
 * Output: [1, 3] — [background, real, spoof] probabilities
 *
 * Reference: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
 *
 * Decision: real_prob >= 0.85 → LIVE
 */
class MiniFASNetLiveness(assets: AssetManager) :
    TFLiteRunner(assets, "minifasnet_quant.tflite") {

    companion object {
        const val INPUT_SIZE = 80
        const val REAL_THRESHOLD = 0.85f
        // Output class indices
        const val IDX_REAL = 1
        const val IDX_SPOOF = 2
    }

    /**
     * Predict whether the face is real or a spoof.
     *
     * @param faceBitmap  Aligned 112×112 face crop from YuNet
     * @return  Real probability in [0, 1]. Values ≥ 0.85 = LIVE.
     */
    fun predict(faceBitmap: Bitmap): Float {
        // MiniFASNet uses a single 80×80 input in this simplified version
        // Full implementation uses two scales (2.7× and 4.0× crops)
        val input = bitmapToByteBuffer(faceBitmap, INPUT_SIZE, INPUT_SIZE, mean = 128f, std = 128f)

        // Output: [1, 3] — softmax probs [background, real, spoof]
        val output = Array(1) { FloatArray(3) }
        interpreter.run(input, output)

        val probs = output[0]
        // Apply softmax if raw logits
        val softmaxed = softmax(probs)
        return softmaxed[IDX_REAL]
    }

    /**
     * Full two-scale prediction for higher accuracy.
     * Scale 2.7× (80×80) + Scale 4.0× (80×80 of a larger crop area).
     * Average the real probabilities.
     */
    fun predictMultiScale(faceBitmap: Bitmap, originalBitmap: Bitmap, bbox: FloatArray): Float {
        // Scale 1: standard face crop resized to 80×80
        val scale1Score = predict(faceBitmap)

        // Scale 2: larger context crop (1.3× the bbox) resized to 80×80
        val padFactor = 0.15f
        val x = (bbox[0] - bbox[2] * padFactor).coerceAtLeast(0f).toInt()
        val y = (bbox[1] - bbox[3] * padFactor).coerceAtLeast(0f).toInt()
        val w = (bbox[2] * (1 + 2 * padFactor)).toInt()
            .coerceAtMost(originalBitmap.width - x)
        val h = (bbox[3] * (1 + 2 * padFactor)).toInt()
            .coerceAtMost(originalBitmap.height - y)

        return try {
            val largeCrop = Bitmap.createBitmap(originalBitmap, x, y, w, h)
            val scale2Score = predict(largeCrop)
            (scale1Score + scale2Score) / 2f
        } catch (e: Exception) {
            scale1Score // Fallback to single scale
        }
    }

    private fun softmax(logits: FloatArray): FloatArray {
        val max = logits.max()
        val exps = FloatArray(logits.size) { i -> kotlin.math.exp((logits[i] - max).toDouble()).toFloat() }
        val sum = exps.sum()
        return FloatArray(exps.size) { i -> exps[i] / sum }
    }
}
