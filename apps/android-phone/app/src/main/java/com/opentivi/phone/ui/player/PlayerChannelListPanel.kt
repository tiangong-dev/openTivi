package com.opentivi.phone.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import com.opentivi.phone.ui.theme.DarkForeground
import com.opentivi.phone.ui.theme.OverlayPanel
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.opentivi.phone.R
import uniffi.opentivi.ChannelInfo

@Composable
fun PlayerChannelListPanel(
    channels: List<ChannelInfo>,
    currentChannelId: Long,
    onChannelSelect: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    val currentIndex = channels.indexOfFirst { it.id == currentChannelId }.coerceAtLeast(0)
    val primaryColor = MaterialTheme.colorScheme.primary

    LaunchedEffect(currentChannelId) {
        if (channels.isNotEmpty()) {
            listState.animateScrollToItem(
                index = (currentIndex - 2).coerceAtLeast(0),
            )
        }
    }

    Column(
        modifier = modifier
            .fillMaxHeight()
            .width(280.dp)
            .clip(RoundedCornerShape(topEnd = 12.dp, bottomEnd = 12.dp))
            .background(OverlayPanel)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = stringResource(R.string.player_channel_list),
            style = MaterialTheme.typography.titleMedium,
            color = DarkForeground,
            modifier = Modifier.padding(bottom = 4.dp),
        )

        LazyColumn(
            state = listState,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            items(channels.size) { index ->
                val ch = channels[index]
                val isCurrent = ch.id == currentChannelId
                val bgColor = if (isCurrent) primaryColor.copy(alpha = 0.2f) else Color.Transparent
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(bgColor)
                        .clickable { onChannelSelect(ch.id) }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (isCurrent) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = primaryColor,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = ch.name,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                            color = if (isCurrent) primaryColor else DarkForeground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        ch.groupName?.let { group ->
                            Text(
                                text = group,
                                style = MaterialTheme.typography.labelSmall,
                                color = DarkForeground.copy(alpha = 0.5f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    ch.channelNumber?.let { num ->
                        Text(
                            text = num,
                            style = MaterialTheme.typography.labelSmall,
                            color = DarkForeground.copy(alpha = 0.5f),
                        )
                    }
                }
            }
        }
    }
}
