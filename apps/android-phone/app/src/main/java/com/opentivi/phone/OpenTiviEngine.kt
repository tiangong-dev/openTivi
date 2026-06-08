package com.opentivi.phone

import android.content.Context
import android.util.Log
import uniffi.opentivi.OpenTiviException
import uniffi.opentivi.Opentivi

/**
 * Initializes the shared Rust core (SQLite, proxy, parsers) once per process.
 * UniFFI loads the native library as "opentivi_android_phone" (see Cargo [lib] name).
 */
object OpenTiviEngine {
    private const val TAG = "OpenTiviEngine"

    @Volatile
    private var initialized = false

    var proxyPort: Int = 0
        private set

    fun init(context: Context) {
        if (initialized) return
        synchronized(this) {
            if (initialized) return
            System.setProperty("uniffi.component.opentivi.libraryOverride", "opentivi_android_phone")
            try {
                proxyPort = Opentivi.initEngine(context.filesDir.absolutePath).toInt()
                initialized = true
                Log.i(TAG, "Rust engine ready, proxyPort=$proxyPort")
            } catch (e: OpenTiviException) {
                Log.e(TAG, "initEngine failed", e)
                throw RuntimeException("OpenTivi native init failed", e)
            }
        }
    }
}
