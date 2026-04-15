package com.opentivi.tv.ui.channels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LiveTv
import androidx.tv.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.viewmodel.ChannelSortOrder
import com.opentivi.tv.viewmodel.ChannelsViewModel

@Composable
fun ChannelsScreen(
    onChannelClick: (Long) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: ChannelsViewModel = hiltViewModel(),
) {
    val groups by viewModel.groups.collectAsState()
    val selectedGroup by viewModel.selectedGroup.collectAsState()
    val channels by viewModel.channels.collectAsState()
    val sortOrder by viewModel.sortOrder.collectAsState()
    val error by viewModel.error.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.tab_channels),
                style = MaterialTheme.typography.headlineLarge,
            )
            // Sort buttons
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { viewModel.setSortOrder(ChannelSortOrder.NAME) },
                ) {
                    Text(
                        stringResource(R.string.channels_sort_name),
                        color = if (sortOrder == ChannelSortOrder.NAME) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                }
                Button(
                    onClick = { viewModel.setSortOrder(ChannelSortOrder.NUMBER) },
                ) {
                    Text(
                        stringResource(R.string.channels_sort_number),
                        color = if (sortOrder == ChannelSortOrder.NUMBER) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                }
                Button(
                    onClick = { viewModel.setSortOrder(ChannelSortOrder.SOURCE) },
                ) {
                    Text(
                        stringResource(R.string.channels_sort_source),
                        color = if (sortOrder == ChannelSortOrder.SOURCE) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurface
                        },
                    )
                }
            }
        }

        if (error != null) {
            Text(
                text = error!!,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        // Group filter chips
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                FilterChip(
                    selected = selectedGroup == null,
                    onClick = { viewModel.selectGroup(null) },
                    label = { Text(stringResource(R.string.channels_all)) },
                )
            }
            items(groups.size) { index ->
                val group = groups[index]
                FilterChip(
                    selected = selectedGroup == group,
                    onClick = { viewModel.selectGroup(group) },
                    label = { Text(group) },
                )
            }
        }

        if (channels.isEmpty() && error == null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 64.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.LiveTv,
                    contentDescription = null,
                    modifier = Modifier.size(72.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(R.string.channels_empty),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(4),
            contentPadding = PaddingValues(bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            items(channels.size) { index ->
                val item = channels[index]
                val ch = item.channel
                ChannelCard(
                    channelName = ch.name,
                    logoUrl = ch.logoUrl,
                    currentProgram = item.nowTitle,
                    isFavorite = ch.isFavorite,
                    onClick = { onChannelClick(ch.id) },
                    onLongClick = { viewModel.toggleFavorite(ch.id, !ch.isFavorite) },
                )
            }
        }
    }
}
