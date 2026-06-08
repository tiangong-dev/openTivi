package com.opentivi.tv.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.theme.TiviMaxWhite
import com.opentivi.tv.ui.theme.TiviOverlayPanel
import com.opentivi.tv.ui.theme.TiviPrimary
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
    val focusRequester = remember { FocusRequester() }

    // Auto-scroll to current channel and request focus
    LaunchedEffect(currentChannelId) {
        if (channels.isNotEmpty()) {
            listState.animateScrollToItem(
                index = (currentIndex - 2).coerceAtLeast(0),
            )
        }
        focusRequester.requestFocus()
    }

    Column(
        modifier = modifier
            .fillMaxHeight()
            .width(320.dp)
            .clip(RoundedCornerShape(topEnd = 12.dp, bottomEnd = 12.dp))
            .background(TiviOverlayPanel)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = stringResource(R.string.player_channel_list),
            style = MaterialTheme.typography.titleMedium,
            color = TiviMaxWhite,
            modifier = Modifier.padding(bottom = 4.dp),
        )

        LazyColumn(
            state = listState,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items(channels.size) { index ->
                val ch = channels[index]
                val isCurrent = ch.id == currentChannelId
                val bgColor = if (isCurrent) TiviPrimary.copy(alpha = 0.2f) else Color.Transparent
                var isFocused by remember { mutableStateOf(false) }
                val itemFocusReq = if (isCurrent) focusRequester else remember { FocusRequester() }
                val displayBg = when {
                    isFocused -> TiviPrimary.copy(alpha = 0.35f)
                    isCurrent -> TiviPrimary.copy(alpha = 0.2f)
                    else -> Color.Transparent
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(displayBg)
                        .focusRequester(itemFocusReq)
                        .onFocusChanged { isFocused = it.isFocused }
                        .focusable()
                        .clickable { onChannelSelect(ch.id) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (isCurrent) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = TiviPrimary,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = ch.name,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal,
                            color = if (isCurrent || isFocused) TiviPrimary else TiviMaxWhite,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        ch.groupName?.let { group ->
                            Text(
                                text = group,
                                style = MaterialTheme.typography.labelSmall,
                                color = TiviMaxWhite.copy(alpha = 0.5f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    ch.channelNumber?.let { num ->
                        Text(
                            text = num,
                            style = MaterialTheme.typography.labelSmall,
                            color = TiviMaxWhite.copy(alpha = 0.5f),
                        )
                    }
                }
            }
        }
    }
}
