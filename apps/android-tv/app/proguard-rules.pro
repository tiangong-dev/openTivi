# OpenTivi TV ProGuard Rules

# Keep UniFFI generated classes
-keep class com.opentivi.tv.bridge.** { *; }
-keep class uniffi.opentivi.** { *; }

# JNA (UniFFI Kotlin backend)
-keep class com.sun.jna.** { *; }
-keepclassmembers class * extends com.sun.jna.** { *; }

# Keep Hilt generated classes
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# Keep Media3 ExoPlayer
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Keep Coil
-keep class coil.** { *; }
