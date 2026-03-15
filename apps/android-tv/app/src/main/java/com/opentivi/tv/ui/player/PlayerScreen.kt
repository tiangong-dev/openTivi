package com.opentivi.tv.ui.player

import android.view.KeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.ui.PlayerView
import com.opentivi.tv.viewmodel.PlayerViewModel
import kotlinx.coroutines.delay

@Composable
fun PlayerScreen(
    channelId: Long,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PlayerViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    var showOverlay by remember { mutableStateOf(true) }

    LaunchedEffect(channelId) {
        viewModel.loadChannel(channelId)
    }

    // Auto-hide overlay after 5 seconds
    LaunchedEffect(showOverlay) {
        if (showOverlay) {
            delay(5000)
            showOverlay = false
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            viewModel.releasePlayer()
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
            .onKeyEvent { event ->
                when (event.nativeKeyEvent.keyCode) {
                    KeyEvent.KEYCODE_BACK -> {
                        onBack()
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        showOverlay = !showOverlay
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        // TODO: Switch to previous channel
                        showOverlay = true
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        // TODO: Switch to next channel
                        showOverlay = true
                        true
                    }
                    else -> false
                }
            },
    ) {
        // ExoPlayer view
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    // TODO: Set player from viewModel.player
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // Overlay
        if (showOverlay) {
            PlayerOverlay(
                channelName = "", // TODO: Get from viewModel
                currentProgram = null,
                nextProgram = null,
            )
        }
    }
}
