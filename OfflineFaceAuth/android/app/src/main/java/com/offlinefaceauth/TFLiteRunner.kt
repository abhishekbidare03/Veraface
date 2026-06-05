package com.offlinefaceauth

import android.content.res.AssetManager
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.nnapi.NnApiDelegate
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * TFLiteRunner.kt
 * Reusable TensorFlow Lite inference runner with NNAPI hardware acceleration.
 * Subclasses override preprocess() and postprocess() for model-specific logic.
 */
abstract class TFLiteRunner(
    assets: AssetManager,
    modelFileName: String,
    private val useNNAPI: Boolean = true,
) {
    protected val interpreter: Interpreter
    private val nnApiDelegate: NnApiDelegate?

    init {
        val model = loadModelFromAssets(assets, modelFileName)
        val options = Interpreter.Options()

        // Enable NNAPI delegate for hardware acceleration on Snapdragon 7s Gen 2
        nnApiDelegate = if (useNNAPI) {
            try {
                val delegate = NnApiDelegate()
                options.addDelegate(delegate)
                delegate
            } catch (e: Exception) {
                android.util.Log.w("TFLiteRunner", "NNAPI not available, falling back to CPU: ${e.message}")
                null
            }
        } else null

        options.setNumThreads(4)
        interpreter = Interpreter(model, options)
    }

    /** Load a TFLite model from the app's assets directory */
    private fun loadModelFromAssets(assets: AssetManager, fileName: String): MappedByteBuffer {
        val fd = assets.openFd(fileName)
        val inputStream = FileInputStream(fd.fileDescriptor)
        val fileChannel = inputStream.channel
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
    }

    /** Convert a Bitmap to a normalized ByteBuffer for TFLite input */
    protected fun bitmapToByteBuffer(
        bitmap: Bitmap,
        width: Int,
        height: Int,
        mean: Float = 128f,
        std: Float = 128f,
    ): ByteBuffer {
        val scaled = Bitmap.createScaledBitmap(bitmap, width, height, true)
        val buffer = ByteBuffer.allocateDirect(1 * width * height * 3 * 4) // float32
        buffer.order(ByteOrder.nativeOrder())

        val pixels = IntArray(width * height)
        scaled.getPixels(pixels, 0, width, 0, 0, width, height)

        for (pixel in pixels) {
            val r = ((pixel shr 16) and 0xFF).toFloat()
            val g = ((pixel shr 8) and 0xFF).toFloat()
            val b = (pixel and 0xFF).toFloat()
            buffer.putFloat((r - mean) / std)
            buffer.putFloat((g - mean) / std)
            buffer.putFloat((b - mean) / std)
        }

        buffer.rewind()
        return buffer
    }

    fun close() {
        interpreter.close()
        nnApiDelegate?.close()
    }
}
