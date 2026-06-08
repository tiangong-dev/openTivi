package com.opentivi.tv.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.theme.TiviMaxWhite
import com.opentivi.tv.ui.theme.TiviOverlayPanel

@Composable
fun PlayerDiagnosticsPanel(
    playbackState: String,
    videoResolution: String,
    videoCodec: String?,
    audioCodec: String?,
    streamUrl: String,
    candidateIndex: Int,
    candidateCount: Int,
    retryCount: Int,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            .width(360.dp)
            .clip(RoundedCornerShape(topStart = 12.dp, bottomStart = 12.dp))
            .background(TiviOverlayPanel)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.player_diagnostics),
            style = MaterialTheme.typography.titleMedium,
            color = TiviMaxWhite,
        )

        DiagRow(stringResource(R.string.player_state), playbackState)
        DiagRow(
            stringResource(R.string.player_resolution),
            videoResolution.ifEmpty { "—" },
        )
        DiagRow(
            stringResource(R.string.player_video_codec),
            videoCodec ?: "—",
        )
        DiagRow(
            stringResource(R.string.player_audio_codec),
            audioCodec ?: "—",
        )
        if (candidateCount > 0) {
            DiagRow(
                stringResource(R.string.player_source_label, candidateIndex + 1, candidateCount),
                "",
            )
        }
        if (retryCount > 0) {
            DiagRow(
                stringResource(R.string.player_retry_count, retryCount, 2),
                "",
            )
        }
        Text(
            text = stringResource(R.string.player_url),
            style = MaterialTheme.typography.labelSmall,
            color = TiviMaxWhite.copy(alpha = 0.6f),
        )
        Text(
            text = streamUrl.ifEmpty { "—" },
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            color = TiviMaxWhite.copy(alpha = 0.8f),
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun DiagRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = TiviMaxWhite.copy(alpha = 0.6f),
        )
        if (value.isNotEmpty()) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = TiviMaxWhite,
            )
        }
    }
}
