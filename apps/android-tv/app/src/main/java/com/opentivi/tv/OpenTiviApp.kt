package com.opentivi.tv

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class OpenTiviApp : Application() {
    override fun onCreate() {
        super.onCreate()
        OpenTiviEngine.init(this)
    }
}
