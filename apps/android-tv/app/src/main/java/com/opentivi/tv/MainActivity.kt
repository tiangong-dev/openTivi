package com.opentivi.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.opentivi.tv.ui.navigation.AppNavigation
import com.opentivi.tv.ui.theme.OpenTiviTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            OpenTiviTheme {
                AppNavigation()
            }
        }
    }
}
