package com.offlinefaceauth

import android.content.res.AssetManager
import android.graphics.Bitmap
import kotlin.math.sqrt

/**
 * MobileFaceNetRecognizer.kt
 * Wraps the MobileFaceNet INT8 TFLite model for face embedding extraction.
 *
 * Model: mobilefacenet_quant.tflite (~1.9 MB)
 * Input:  [1, 112, 112, 3] — RGB, normalized to [-1, 1]
 * Output: [1, 128]         — L2-normalized 128-dim embedding
 *
 * Reference: https://github.com/deepinsight/insightface
 */
class MobileFaceNetRecognizer(assets: AssetManager) :
    TFLiteRunner(assets, "mobilefacenet_quant.tflite") {

    companion object {
        const val INPUT_SIZE = 112
        const val EMBEDDING_DIM = 128
        // Normalize to [-1, 1] as per ArcFace training
        const val INPUT_MEAN = 127.5f
        const val INPUT_STD = 127.5f
    }

    /**
     * Extract a 128-dimensional embedding from a 112×112 aligned face bitmap.
     * The output is L2-normalized (unit vector) suitable for cosine similarity.
     *
     * @param faceBitmap  Should be a 112×112 aligned face crop
     * @return Float array of 128 values (L2-normalized)
     */
    fun extractEmbedding(faceBitmap: Bitmap): FloatArray {
        val input = bitmapToByteBuffer(
            faceBitmap,
            INPUT_SIZE,
            INPUT_SIZE,
            mean = INPUT_MEAN,
            std = INPUT_STD,
        )

        // Output buffer: [1, 128]
        val output = Array(1) { FloatArray(EMBEDDING_DIM) }
        interpreter.run(input, output)

        return l2Normalize(output[0])
    }

    /**
     * L2-normalize a float vector in place.
     */
    private fun l2Normalize(vec: FloatArray): FloatArray {
        var norm = 0f
        for (v in vec) norm += v * v
        norm = sqrt(norm)
        if (norm == 0f) return vec
        return FloatArray(vec.size) { i -> vec[i] / norm }
    }
}
