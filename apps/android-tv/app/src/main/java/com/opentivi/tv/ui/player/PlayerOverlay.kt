package com.opentivi.tv.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material3.Button
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.components.EpgBar
import com.opentivi.tv.ui.theme.TiviBackground
import com.opentivi.tv.ui.theme.TiviDestructive
import com.opentivi.tv.ui.theme.TiviFavorite
import com.opentivi.tv.ui.theme.TiviMaxWhite

@Composable
fun PlayerOverlay(
    channelName: String,
    currentProgram: String?,
    nextProgram: String?,
    playbackError: String?,
    retryCount: Int,
    candidateIndex: Int,
    candidateCount: Int,
    onRetry: () -> Unit,
    isFavorite: Boolean,
    onToggleFavorite: () -> Unit,
    onSwitchSource: () -> Unit,
    onToggleDiagnostics: () -> Unit,
    onToggleChannelList: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        // Top bar with action buttons
        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(24.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            IconButton(onClick = onToggleFavorite) {
                Icon(
                    imageVector = if (isFavorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder,
                    contentDescription = stringResource(
                        if (isFavorite) R.string.channels_unfavorite else R.string.channels_favorite,
                    ),
                    tint = if (isFavorite) TiviFavorite else TiviMaxWhite,
                    modifier = Modifier.size(28.dp),
                )
            }
            IconButton(onClick = onToggleChannelList) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.List,
                    contentDescription = stringResource(R.string.player_channel_list),
                    tint = TiviMaxWhite,
                    modifier = Modifier.size(28.dp),
                )
            }
            IconButton(onClick = onToggleDiagnostics) {
                Icon(
                    imageVector = Icons.Outlined.Info,
                    contentDescription = stringResource(R.string.player_diagnostics),
                    tint = TiviMaxWhite,
                    modifier = Modifier.size(28.dp),
                )
            }
        }

        // Bottom gradient overlay with channel info
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color.Transparent, TiviBackground.copy(alpha = 0.8f)),
                    )
                )
                .padding(horizontal = 48.dp, vertical = 32.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = channelName,
                    style = MaterialTheme.typography.headlineMedium,
                    color = TiviMaxWhite,
                )
                if (candidateCount > 1) {
                    Spacer(modifier = Modifier.width(12.dp))
                    Button(onClick = onSwitchSource) {
                        Text(
                            text = stringResource(
                                R.string.player_source_label,
                                candidateIndex + 1,
                                candidateCount,
                            ),
                        )
                    }
                }
            }

            if (playbackError != null) {
                Text(
                    text = "${stringResource(R.string.player_error)}: $playbackError",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TiviDestructive,
                )
                if (retryCount > 0) {
                    Text(
                        text = stringResource(R.string.player_retry_count, retryCount, 2),
                        style = MaterialTheme.typography.labelSmall,
                        color = TiviMaxWhite.copy(alpha = 0.7f),
                    )
                }
                Button(onClick = onRetry) {
                    Text(stringResource(R.string.player_retry))
                }
            }

            if (currentProgram != null) {
                Text(
                    text = "${stringResource(R.string.player_now)}: $currentProgram",
                    style = MaterialTheme.typography.bodyLarge,
                    color = TiviMaxWhite.copy(alpha = 0.9f),
                )
                EpgBar(progress = 0f)
            }

            if (nextProgram != null) {
                Text(
                    text = "${stringResource(R.string.player_next)}: $nextProgram",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TiviMaxWhite.copy(alpha = 0.7f),
                )
            }
        }
    }
}
