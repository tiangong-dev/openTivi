package com.opentivi.tv

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class OpenTiviApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // TODO: Initialize Rust bridge
        // RustBridge.init(filesDir.absolutePath)
    }
}
