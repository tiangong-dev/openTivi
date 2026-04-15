package com.opentivi.phone.ui.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.LayoutInflater
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.ui.PlayerView
import com.opentivi.phone.R
import com.opentivi.phone.ui.theme.DarkBackground
import com.opentivi.phone.ui.theme.DarkForeground
import com.opentivi.phone.ui.theme.DarkPrimary
import com.opentivi.phone.ui.theme.LiveRed
import com.opentivi.phone.ui.theme.OverlayScrim
import com.opentivi.phone.viewmodel.PlayerViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

@Composable
fun PlayerScreen(
    channelId: Long,
    playerViewModel: PlayerViewModel,
    onBack: () -> Unit,
) {
    val channelName by playerViewModel.channelName.collectAsStateWithLifecycle()
    val channelGroup by playerViewModel.channelGroup.collectAsStateWithLifecycle()
    val epgSnapshot by playerViewModel.epgSnapshot.collectAsStateWithLifecycle()
    val playbackError by playerViewModel.playbackError.collectAsStateWithLifecycle()
    val isFavorite by playerViewModel.isFavorite.collectAsStateWithLifecycle()
    val networkSpeed by playerViewModel.networkSpeed.collectAsStateWithLifecycle()
    val playbackState by playerViewModel.playbackState.collectAsStateWithLifecycle()
    val videoResolution by playerViewModel.videoResolution.collectAsStateWithLifecycle()
    val videoCodec by playerViewModel.videoCodec.collectAsStateWithLifecycle()
    val audioCodec by playerViewModel.audioCodec.collectAsStateWithLifecycle()
    val currentStreamUrl by playerViewModel.currentStreamUrl.collectAsStateWithLifecycle()
    val candidateIndex by playerViewModel.currentCandidateIndex.collectAsStateWithLifecycle()
    val candidateCount by playerViewModel.candidateCount.collectAsStateWithLifecycle()
    val retryCount by playerViewModel.retryCount.collectAsStateWithLifecycle()
    val orderedChannels by playerViewModel.orderedChannels.collectAsStateWithLifecycle()
    val currentIndex by playerViewModel.currentIndex.collectAsStateWithLifecycle()

    var showChannelList by remember { mutableStateOf(false) }
    var showDiagnostics by remember { mutableStateOf(false) }
    var showLockedOverlay by remember { mutableStateOf(false) }

    val context = LocalContext.current

    // Locked overlay auto-hide after 5 seconds
    LaunchedEffect(showLockedOverlay) {
        if (showLockedOverlay) {
            delay(5_000)
            showLockedOverlay = false
        }
    }

    // Landscape orientation control
    LaunchedEffect(playerViewModel.isLandscape) {
        val activity = context as? Activity ?: return@LaunchedEffect
        activity.requestedOrientation = if (playerViewModel.isLandscape) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        }
    }

    // Reset orientation when leaving the player
    DisposableEffect(Unit) {
        onDispose {
            (context as? Activity)?.requestedOrientation =
                ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            playerViewModel.isLandscape = false
        }
    }

    BackHandler {
        when {
            playerViewModel.isLocked -> {
                // When locked, back toggles the locked overlay
                showLockedOverlay = !showLockedOverlay
            }
            showChannelList -> showChannelList = false
            showDiagnostics -> showDiagnostics = false
            else -> onBack()
        }
    }

    val pagerState = rememberPagerState(
        initialPage = 0,
        pageCount = { orderedChannels.size.coerceAtLeast(1) },
    )

    var hasInitialized by remember { mutableStateOf(false) }
    LaunchedEffect(orderedChannels, currentIndex) {
        if (orderedChannels.isNotEmpty()) {
            if (!hasInitialized) {
                pagerState.scrollToPage(currentIndex)
                hasInitialized = true
            } else if (pagerState.settledPage != currentIndex) {
                pagerState.animateScrollToPage(currentIndex)
            }
        }
    }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.settledPage }
            .distinctUntilChanged()
            .collect { page ->
                val channel = orderedChannels.getOrNull(page)
                if (channel != null && channel.id != playerViewModel.currentChannelId) {
                    playerViewModel.switchToChannel(channel.id)
                }
            }
    }

    Box(modifier = Modifier.fillMaxSize().background(DarkBackground)) {
        VerticalPager(
            state = pagerState,
            userScrollEnabled = !playerViewModel.isLocked,
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            val channel = orderedChannels.getOrNull(page)
            val isSettledPage = page == pagerState.settledPage

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(DarkBackground),
            ) {
                // Video layer
                if (isSettledPage) {
                    AndroidView(
                        factory = { ctx ->
                            (LayoutInflater.from(ctx).inflate(
                                R.layout.player_texture_view, null,
                            ) as PlayerView).apply {
                                player = playerViewModel.exoPlayer
                            }
                        },
                        update = { view ->
                            view.player = playerViewModel.exoPlayer
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = channel?.name ?: "",
                            style = MaterialTheme.typography.headlineMedium,
                            color = DarkForeground,
                            textAlign = TextAlign.Center,
                        )
                    }
                }

                // ── HUD (scrolls with page) ──

                if (playerViewModel.isLocked) {
                    // Locked mode: tap to show minimal overlay
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(Unit) {
                                detectTapGestures {
                                    showLockedOverlay = !showLockedOverlay
                                }
                            },
                    )

                    // Locked overlay: unlock button + channel info
                    AnimatedVisibility(
                        visible = showLockedOverlay,
                        enter = fadeIn(),
                        exit = fadeOut(),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        Box(modifier = Modifier.fillMaxSize()) {
                            // Unlock button at center-left
                            IconButton(
                                onClick = { playerViewModel.isLocked = false },
                                modifier = Modifier
                                    .align(Alignment.CenterStart)
                                    .padding(start = 16.dp)
                                    .size(56.dp)
                                    .clip(CircleShape)
                                    .background(OverlayScrim),
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Lock,
                                    contentDescription = "Unlock",
                                    tint = DarkForeground,
                                    modifier = Modifier.size(28.dp),
                                )
                            }

                            // Channel name at bottom-left
                            if (isSettledPage) {
                                Column(
                                    modifier = Modifier
                                        .align(Alignment.BottomStart)
                                        .navigationBarsPadding()
                                        .padding(start = 16.dp, bottom = 16.dp),
                                ) {
                                    Text(
                                        text = channelName,
                                        style = MaterialTheme.typography.titleMedium.copy(
                                            fontWeight = FontWeight.Bold,
                                            shadow = Shadow(color = DarkBackground, blurRadius = 8f),
                                        ),
                                        color = DarkForeground,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                    if (!channelGroup.isNullOrEmpty()) {
                                        Text(
                                            text = channelGroup ?: "",
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                            ),
                                            color = DarkForeground.copy(alpha = 0.7f),
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else {
                    // ── Normal (unlocked) HUD ──

                    // Top-left: back
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier
                            .statusBarsPadding()
                            .padding(start = 4.dp, top = 4.dp)
                            .align(Alignment.TopStart),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = DarkForeground,
                            modifier = Modifier.size(28.dp),
                        )
                    }

                    // Center-left: lock button (matching iOS position)
                    IconButton(
                        onClick = { playerViewModel.isLocked = true },
                        modifier = Modifier
                            .align(Alignment.CenterStart)
                            .padding(start = 16.dp)
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(OverlayScrim),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.LockOpen,
                            contentDescription = "Lock",
                            tint = DarkForeground,
                            modifier = Modifier.size(24.dp),
                        )
                    }

                    // Error (center)
                    if (isSettledPage && playbackError != null) {
                        Column(
                            modifier = Modifier.align(Alignment.Center),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.player_error),
                                style = MaterialTheme.typography.titleMedium,
                                color = DarkForeground,
                            )
                            Text(
                                text = playbackError ?: "",
                                style = MaterialTheme.typography.bodySmall,
                                color = DarkForeground.copy(alpha = 0.7f),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            IconButton(
                                onClick = { playerViewModel.manualRetry() },
                                modifier = Modifier
                                    .size(56.dp)
                                    .clip(CircleShape)
                                    .background(DarkForeground.copy(alpha = 0.2f)),
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Refresh,
                                    contentDescription = stringResource(R.string.player_retry),
                                    tint = DarkForeground,
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                        }
                    }

                    // Bottom: left info + right actions
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(start = 16.dp, end = 8.dp, bottom = 16.dp),
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        // ── Left: channel info, EPG, speed ──
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            if (isSettledPage) {
                                // Channel name
                                Text(
                                    text = channelName,
                                    style = MaterialTheme.typography.titleLarge.copy(
                                        fontWeight = FontWeight.Bold,
                                        shadow = Shadow(color = DarkBackground, blurRadius = 8f),
                                    ),
                                    color = DarkForeground,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )

                                // Group name
                                if (!channelGroup.isNullOrEmpty()) {
                                    Text(
                                        text = channelGroup ?: "",
                                        style = MaterialTheme.typography.bodySmall.copy(
                                            shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                        ),
                                        color = DarkForeground.copy(alpha = 0.7f),
                                        maxLines = 1,
                                    )
                                }

                                // EPG now
                                epgSnapshot?.now?.let { now ->
                                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            EpgBadge(
                                                text = stringResource(R.string.player_now).uppercase(),
                                                color = DarkPrimary,
                                            )
                                            Text(
                                                text = now.title,
                                                style = MaterialTheme.typography.bodySmall.copy(
                                                    fontWeight = FontWeight.SemiBold,
                                                    shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                                ),
                                                color = DarkForeground,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                        Text(
                                            text = "${formatEpgTime(now.startAt)} – ${formatEpgTime(now.endAt)}",
                                            style = MaterialTheme.typography.labelSmall.copy(
                                                shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                            ),
                                            color = DarkForeground.copy(alpha = 0.6f),
                                        )
                                    }
                                }

                                // EPG next
                                epgSnapshot?.next?.let { next ->
                                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            EpgBadge(
                                                text = stringResource(R.string.player_next).uppercase(),
                                                color = DarkForeground.copy(alpha = 0.3f),
                                            )
                                            Text(
                                                text = next.title,
                                                style = MaterialTheme.typography.bodySmall.copy(
                                                    shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                                ),
                                                color = DarkForeground.copy(alpha = 0.85f),
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        }
                                        Text(
                                            text = "${formatEpgTime(next.startAt)} – ${formatEpgTime(next.endAt)}",
                                            style = MaterialTheme.typography.labelSmall.copy(
                                                shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                            ),
                                            color = DarkForeground.copy(alpha = 0.5f),
                                        )
                                    }
                                }

                                // Source indicator (tappable to switch)
                                if (candidateCount > 1) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(DarkForeground.copy(alpha = 0.15f))
                                            .pointerInput(Unit) {
                                                detectTapGestures { playerViewModel.switchSource() }
                                            }
                                            .padding(horizontal = 8.dp, vertical = 4.dp),
                                    ) {
                                        Text(
                                            text = stringResource(
                                                R.string.player_source_label,
                                                candidateIndex + 1,
                                                candidateCount,
                                            ),
                                            style = MaterialTheme.typography.labelSmall.copy(
                                                fontWeight = FontWeight.SemiBold,
                                                shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                            ),
                                            color = DarkForeground,
                                        )
                                        Icon(
                                            imageVector = Icons.Filled.Refresh,
                                            contentDescription = "Switch source",
                                            tint = DarkForeground.copy(alpha = 0.7f),
                                            modifier = Modifier.size(12.dp),
                                        )
                                    }
                                }

                                // Network speed
                                if (networkSpeed.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                                    ) {
                                        Icon(
                                            imageVector = Icons.Filled.ArrowDownward,
                                            contentDescription = null,
                                            tint = DarkForeground.copy(alpha = 0.6f),
                                            modifier = Modifier.size(12.dp),
                                        )
                                        Text(
                                            text = networkSpeed,
                                            style = MaterialTheme.typography.labelSmall.copy(
                                                shadow = Shadow(color = DarkBackground, blurRadius = 4f),
                                            ),
                                            color = DarkForeground.copy(alpha = 0.7f),
                                        )
                                    }
                                }

                                // Retry count
                                if (retryCount > 0) {
                                    Text(
                                        text = stringResource(R.string.player_retry_count, retryCount, 2),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = DarkForeground.copy(alpha = 0.5f),
                                    )
                                }
                            } else {
                                // Non-current page: just the channel name
                                Text(
                                    text = channel?.name ?: "",
                                    style = MaterialTheme.typography.titleLarge.copy(
                                        fontWeight = FontWeight.Bold,
                                        shadow = Shadow(color = DarkBackground, blurRadius = 8f),
                                    ),
                                    color = DarkForeground,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (!channel?.groupName.isNullOrEmpty()) {
                                    Text(
                                        text = channel?.groupName ?: "",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = DarkForeground.copy(alpha = 0.7f),
                                    )
                                }
                            }
                        }

                        // ── Right: action buttons ──
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(20.dp),
                            modifier = Modifier.padding(bottom = 8.dp),
                        ) {
                            ActionButton(
                                icon = if (isSettledPage && isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                label = stringResource(
                                    if (isSettledPage && isFavorite) R.string.channels_unfavorite else R.string.channels_favorite,
                                ),
                                tint = if (isSettledPage && isFavorite) LiveRed else DarkForeground,
                                onClick = { playerViewModel.toggleFavorite() },
                            )
                            ActionButton(
                                icon = Icons.AutoMirrored.Filled.List,
                                label = stringResource(R.string.player_channel_list),
                                onClick = { showChannelList = true },
                            )
                            ActionButton(
                                icon = Icons.Outlined.Info,
                                label = stringResource(R.string.player_diagnostics),
                                onClick = { showDiagnostics = true },
                            )
                            ActionButton(
                                icon = if (playerViewModel.isLandscape) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen,
                                label = if (playerViewModel.isLandscape) "Portrait" else "Landscape",
                                onClick = { playerViewModel.isLandscape = !playerViewModel.isLandscape },
                            )
                        }
                    }
                }
            }
        }

        // Channel list panel with scrim
        if (showChannelList) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(OverlayScrim)
                    .pointerInput(Unit) {
                        detectTapGestures { showChannelList = false }
                    },
            )
            AnimatedVisibility(
                visible = true,
                enter = slideInHorizontally { -it },
                exit = slideOutHorizontally { -it },
                modifier = Modifier.align(Alignment.CenterStart),
            ) {
                PlayerChannelListPanel(
                    channels = orderedChannels,
                    currentChannelId = playerViewModel.currentChannelId ?: 0L,
                    onChannelSelect = { id ->
                        playerViewModel.switchToChannel(id)
                        showChannelList = false
                    },
                )
            }
        }

        // Diagnostics panel with scrim
        if (showDiagnostics) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(OverlayScrim)
                    .pointerInput(Unit) {
                        detectTapGestures { showDiagnostics = false }
                    },
            )
            AnimatedVisibility(
                visible = true,
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
}

/** Small colored badge for EPG labels (NOW / NEXT), matching iOS style. */
@Composable
private fun EpgBadge(text: String, color: Color) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall.copy(
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
        ),
        color = DarkForeground,
        modifier = Modifier
            .background(color, RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun ActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    tint: Color = DarkForeground,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(
            onClick = onClick,
            modifier = Modifier.size(44.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = tint,
                modifier = Modifier.size(30.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 10.sp,
                shadow = Shadow(color = DarkBackground, blurRadius = 4f),
            ),
            color = DarkForeground.copy(alpha = 0.8f),
        )
    }
}

/**
 * Parse XMLTV-style timestamp (e.g. "20260330143000 +0800") to "HH:mm" local display.
 * Falls back to returning the raw string trimmed if parsing fails.
 */
private fun formatEpgTime(raw: String): String {
    return try {
        val sdf = SimpleDateFormat("yyyyMMddHHmmss Z", Locale.US)
        val date = sdf.parse(raw.trim()) ?: return raw.take(12)
        val outFmt = SimpleDateFormat("HH:mm", Locale.getDefault())
        outFmt.timeZone = TimeZone.getDefault()
        outFmt.format(date)
    } catch (_: Exception) {
        raw.take(12)
    }
}
