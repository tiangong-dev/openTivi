package com.opentivi.tv.ui.player

import android.view.KeyEvent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.ui.PlayerView
import com.opentivi.tv.ui.theme.TiviBackground
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
    var showDiagnostics by remember { mutableStateOf(false) }
    var showChannelList by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }

    val channelName by viewModel.channelName.collectAsState()
    val currentProgram by viewModel.currentProgram.collectAsState()
    val nextProgram by viewModel.nextProgram.collectAsState()
    val playbackError by viewModel.playbackError.collectAsState()
    val retryCount by viewModel.retryCount.collectAsState()
    val playbackState by viewModel.playbackState.collectAsState()
    val videoResolution by viewModel.videoResolution.collectAsState()
    val videoCodec by viewModel.videoCodec.collectAsState()
    val audioCodec by viewModel.audioCodec.collectAsState()
    val currentStreamUrl by viewModel.currentStreamUrl.collectAsState()
    val candidateIndex by viewModel.currentCandidateIndex.collectAsState()
    val candidateCount by viewModel.candidateCount.collectAsState()
    val orderedChannels by viewModel.orderedChannels.collectAsState()
    val isFavorite by viewModel.isFavorite.collectAsState()

    LaunchedEffect(channelId) {
        viewModel.loadChannel(channelId)
    }

    // Request focus so key events reach this composable
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
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
            .background(TiviBackground)
            .focusRequester(focusRequester)
            .focusable()
            .onPreviewKeyEvent { event ->
                if (event.nativeKeyEvent.action != KeyEvent.ACTION_DOWN) return@onPreviewKeyEvent false
                when (event.nativeKeyEvent.keyCode) {
                    KeyEvent.KEYCODE_BACK -> {
                        when {
                            showChannelList -> {
                                showChannelList = false
                                focusRequester.requestFocus()
                                true
                            }
                            showDiagnostics -> { showDiagnostics = false; true }
                            else -> { onBack(); true }
                        }
                    }
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        if (showChannelList) {
                            false // let channel list handle the click
                        } else {
                            showOverlay = !showOverlay
                            true
                        }
                    }
                    KeyEvent.KEYCODE_DPAD_UP -> {
                        if (showChannelList) {
                            false // let channel list handle navigation
                        } else {
                            viewModel.switchToPreviousChannel()
                            showOverlay = true
                            true
                        }
                    }
                    KeyEvent.KEYCODE_DPAD_DOWN -> {
                        if (showChannelList) {
                            false // let channel list handle navigation
                        } else {
                            viewModel.switchToNextChannel()
                            showOverlay = true
                            true
                        }
                    }
                    KeyEvent.KEYCODE_DPAD_LEFT -> {
                        showChannelList = !showChannelList
                        showDiagnostics = false
                        showOverlay = true
                        true
                    }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> {
                        showDiagnostics = !showDiagnostics
                        showChannelList = false
                        showOverlay = true
                        true
                    }
                    KeyEvent.KEYCODE_D -> {
                        showDiagnostics = !showDiagnostics
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
                playbackError = playbackError,
                retryCount = retryCount,
                candidateIndex = candidateIndex,
                candidateCount = candidateCount,
                isFavorite = isFavorite,
                onToggleFavorite = { viewModel.toggleFavorite() },
                onSwitchSource = { viewModel.switchSource() },
                onRetry = { viewModel.manualRetry() },
                onToggleDiagnostics = {
                    showDiagnostics = !showDiagnostics
                    showChannelList = false
                },
                onToggleChannelList = {
                    showChannelList = !showChannelList
                    showDiagnostics = false
                },
            )
        }

        // Channel list panel (left side)
        AnimatedVisibility(
            visible = showChannelList,
            enter = slideInHorizontally { -it },
            exit = slideOutHorizontally { -it },
            modifier = Modifier.align(Alignment.CenterStart),
        ) {
            PlayerChannelListPanel(
                channels = orderedChannels,
                currentChannelId = channelId,
                onChannelSelect = { id ->
                    viewModel.switchToChannel(id)
                    showChannelList = false
                    showOverlay = true
                },
            )
        }

        // Diagnostics panel (right side)
        AnimatedVisibility(
            visible = showDiagnostics,
            enter = slideInHorizontally { it },
            exit = slideOutHorizontally { it },
            modifier = Modifier.align(Alignment.CenterEnd),
        ) {
            PlayerDiagnosticsPanel(
                playbackState = playbackState,
                videoResolution = videoResolution,
                videoCodec = videoCodec,
                audioCodec = audioCodec,
                streamUrl = currentStreamUrl,
                candidateIndex = candidateIndex,
                candidateCount = candidateCount,
                retryCount = retryCount,
            )
        }
    }
}
