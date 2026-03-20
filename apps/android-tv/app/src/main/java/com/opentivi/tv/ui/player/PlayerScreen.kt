package com.opentivi.tv.ui.player

import android.view.KeyEvent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onKeyEvent
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
    var showOverlay by remember { mutableStateOf(true) }
    val channelName by viewModel.channelName.collectAsState()
    val currentProgram by viewModel.currentProgram.collectAsState()
    val nextProgram by viewModel.nextProgram.collectAsState()

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
                        viewModel.switchToPreviousChannel()
                        showOverlay = true
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        viewModel.switchToNextChannel()
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
                    player = viewModel.exoPlayer
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // Overlay
        if (showOverlay) {
            PlayerOverlay(
                channelName = channelName,
                currentProgram = currentProgram,
                nextProgram = nextProgram,
            )
        }
    }
}
