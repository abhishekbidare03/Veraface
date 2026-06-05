# Add project specific ProGuard rules here.

# ─── TensorFlow Lite ──────────────────────────────────────────────────────────
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.gpu.** { *; }
-keepclassmembers class org.tensorflow.lite.** { *; }

# ─── SQLCipher ────────────────────────────────────────────────────────────────
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }

# ─── Veraface Native Module ───────────────────────────────────────────────────
-keep class com.offlinefaceauth.** { *; }

# ─── React Native ─────────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**

