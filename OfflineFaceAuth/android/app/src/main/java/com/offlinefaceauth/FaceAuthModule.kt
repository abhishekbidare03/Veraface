package com.offlinefaceauth

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.*
import android.util.Log

/**
 * FaceAuthModule.kt  (v2 — with MediaPipe landmark support)
 *
 * Exposes to React Native JS:
 *   initialize()        → Promise<Boolean>
 *   getStatus()         → Promise<{detector, recognizer, liveness, landmarks}>
 *   processFrame(path)  → Promise<FaceDetectionResult>
 *   enrollFace(path, id)→ Promise<EnrollResult>
 */
@ReactModule(name = FaceAuthModule.MODULE_NAME)
class FaceAuthModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "FaceAuthModule"
        private const val TAG = "FaceAuthModule"
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private lateinit var detector: YuNetDetector
    private lateinit var recognizer: MobileFaceNetRecognizer
    private lateinit var liveness: MiniFASNetLiveness
    private var landmarkDetector: MediaPipeLandmarks? = null   // optional
    private var isInitialized = false

    override fun getName() = MODULE_NAME

    // ──────────────────────────────────────────────────────────────────────────
    // initialize()
    // ──────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun initialize(promise: Promise) {
        scope.launch {
            try {
                val assets = reactApplicationContext.assets
                detector   = YuNetDetector(assets)
                recognizer = MobileFaceNetRecognizer(assets)
                liveness   = MiniFASNetLiveness(assets)

                // MediaPipe landmarks — optional, skip if model not bundled
                landmarkDetector = try {
                    MediaPipeLandmarks(assets)
                } catch (e: Exception) {
                    Log.w(TAG, "MediaPipe model not found, active liveness will use JS geometry: ${e.message}")
                    null
                }

                isInitialized = true
                Log.i(TAG, "✅ All models initialized")
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Init failed", e)
                promise.reject("INIT_ERROR", "Failed to initialize models: ${e.message}", e)
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // getStatus()
    // ──────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getStatus(promise: Promise) {
        val map = WritableNativeMap().apply {
            putBoolean("detector",    isInitialized && ::detector.isInitialized)
            putBoolean("recognizer",  isInitialized && ::recognizer.isInitialized)
            putBoolean("liveness",    isInitialized && ::liveness.isInitialized)
            putBoolean("landmarks",   landmarkDetector != null)
        }
        promise.resolve(map)
    }

    // ──────────────────────────────────────────────────────────────────────────
    // processFrame(imagePath)
    // ──────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun processFrame(imagePath: String, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INIT", "Call initialize() first"); return
        }
        scope.launch {
            val t0 = System.currentTimeMillis()
            try {
                val bitmap = loadBitmap(imagePath)
                    ?: return@launch promise.reject("DECODE_ERROR", "Cannot decode image at: $imagePath")

                // 1. Detection
                val detection = detector.detect(bitmap)
                val result = WritableNativeMap()
                result.putBoolean("faceFound", detection.faceFound)

                if (!detection.faceFound) {
                    promise.resolve(result); return@launch
                }

                // Bounding box
                detection.boundingBox?.let { bb ->
                    result.putArray("boundingBox", toWritableArray(bb.map { it.toDouble() }))
                }

                // 2. Aligned crop
                val alignedFace = detector.getAlignedFace(bitmap, detection)
                    ?: return@launch promise.resolve(result)   // no aligned face

                // 3. Recognition + liveness IN PARALLEL
                val embeddingDeferred = async { recognizer.extractEmbedding(alignedFace) }
                val livenessDeferred  = async { liveness.predict(alignedFace) }

                val embedding     = embeddingDeferred.await()
                val livenessScore = livenessDeferred.await()

                result.putArray("embedding",     toWritableArray(embedding.map { it.toDouble() }))
                result.putDouble("livenessScore", livenessScore.toDouble())
                result.putBoolean("isLive",       livenessScore >= 0.85f)

                // 4. MediaPipe landmarks (if available)
                landmarkDetector?.let { mpd ->
                    val lmResult = mpd.detect(alignedFace)
                    if (lmResult.found && lmResult.landmarks != null) {
                        val meshArray = WritableNativeArray()
                        for (lm in lmResult.landmarks) {
                            val pt = WritableNativeMap()
                            pt.putDouble("x", lm[0].toDouble())
                            pt.putDouble("y", lm[1].toDouble())
                            pt.putDouble("z", lm[2].toDouble())
                            meshArray.pushMap(pt)
                        }
                        result.putArray("meshLandmarks", meshArray)
                        result.putDouble("ear", lmResult.ear.toDouble())
                        result.putDouble("mar", lmResult.mar.toDouble())
                        result.putDouble("yawDeg", lmResult.yawDeg.toDouble())
                        result.putBoolean("isBlinking", lmResult.isBlinking)
                        result.putBoolean("isSmiling",  lmResult.isSmiling)
                        result.putBoolean("isTurned",   lmResult.isTurned)
                    }
                }

                val latency = System.currentTimeMillis() - t0
                result.putDouble("inferenceMs", latency.toDouble())
                Log.d(TAG, "processFrame done in ${latency}ms | live=${livenessScore.format(2)}")

                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "processFrame error", e)
                promise.reject("INFERENCE_ERROR", e.message, e)
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // enrollFace(imagePath, personId)
    // ──────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun enrollFace(imagePath: String, personId: String, promise: Promise) {
        if (!isInitialized) {
            promise.reject("NOT_INIT", "Call initialize() first"); return
        }
        scope.launch {
            try {
                val bitmap = loadBitmap(imagePath)
                    ?: return@launch promise.reject("DECODE_ERROR", "Cannot decode: $imagePath")

                val detection = detector.detect(bitmap)
                val result = WritableNativeMap()

                if (!detection.faceFound) {
                    result.putBoolean("success", false)
                    result.putString("error", "No face detected in frame")
                    return@launch promise.resolve(result)
                }

                val aligned = detector.getAlignedFace(bitmap, detection)
                if (aligned == null) {
                    result.putBoolean("success", false)
                    result.putString("error", "Face alignment failed")
                    return@launch promise.resolve(result)
                }

                val embedding = recognizer.extractEmbedding(aligned)
                result.putBoolean("success", true)
                result.putArray("embedding", toWritableArray(embedding.map { it.toDouble() }))
                Log.d(TAG, "enrollFace OK for personId=$personId")
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "enrollFace error", e)
                promise.reject("ENROLL_ERROR", e.message, e)
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private fun loadBitmap(path: String): Bitmap? = try {
        BitmapFactory.decodeFile(path)
    } catch (e: Exception) { null }

    private fun toWritableArray(values: List<Double>): WritableNativeArray {
        val arr = WritableNativeArray()
        values.forEach { arr.pushDouble(it) }
        return arr
    }

    private fun Float.format(digits: Int) = "%.${digits}f".format(this)

    override fun onCatalystInstanceDestroy() {
        scope.cancel()
        if (::detector.isInitialized)    detector.close()
        if (::recognizer.isInitialized)  recognizer.close()
        if (::liveness.isInitialized)    liveness.close()
        landmarkDetector?.close()
    }
}
