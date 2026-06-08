package com.opentivi.tv.ui.epgsearch

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.theme.TiviCard
import com.opentivi.tv.ui.theme.TiviLive
import com.opentivi.tv.viewmodel.EpgSearchViewModel
import com.opentivi.tv.viewmodel.EpgStateFilter

@Composable
fun EpgSearchScreen(
    onChannelClick: (Long) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: EpgSearchViewModel = hiltViewModel(),
) {
    val results by viewModel.results.collectAsState()
    val searchQuery by viewModel.searchQuery.collectAsState()
    val stateFilter by viewModel.stateFilter.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = stringResource(R.string.epg_search_title),
            style = MaterialTheme.typography.headlineLarge,
        )

        OutlinedTextField(
            value = searchQuery,
            onValueChange = { viewModel.setSearchQuery(it) },
            label = { Text(stringResource(R.string.epg_search_hint)) },
            modifier = Modifier.fillMaxWidth(0.5f),
            singleLine = true,
        )

        // State filter chips
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = stateFilter == EpgStateFilter.ALL,
                onClick = { viewModel.setStateFilter(EpgStateFilter.ALL) },
                label = { Text(stringResource(R.string.epg_search_all)) },
            )
            FilterChip(
                selected = stateFilter == EpgStateFilter.LIVE,
                onClick = { viewModel.setStateFilter(EpgStateFilter.LIVE) },
                label = { Text(stringResource(R.string.epg_search_live)) },
            )
            FilterChip(
                selected = stateFilter == EpgStateFilter.UPCOMING,
                onClick = { viewModel.setStateFilter(EpgStateFilter.UPCOMING) },
                label = { Text(stringResource(R.string.epg_search_upcoming)) },
            )
        }

        if (results.isEmpty() && searchQuery.isNotBlank()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 64.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.SearchOff,
                    contentDescription = null,
                    modifier = Modifier.size(72.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(R.string.epg_search_empty),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(results.size) { index ->
                val result = results[index]
                val isLive = isCurrentlyLive(result.startAt, result.endAt)
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                    colors = CardDefaults.cardColors(containerColor = TiviCard),
                    onClick = { onChannelClick(result.channelId) },
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = result.title,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            if (isLive) {
                                Text(
                                    text = stringResource(R.string.epg_search_live_badge),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = TiviLive,
                                    fontWeight = FontWeight.Bold,
                                )
                            }
                        }
                        Text(
                            text = result.channelName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "${formatTime(result.startAt)} – ${formatTime(result.endAt)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        result.description?.let { desc ->
                            if (desc.isNotBlank()) {
                                Text(
                                    text = desc,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Simple check: if start_at <= now <= end_at */
private fun isCurrentlyLive(startAt: String, endAt: String): Boolean {
    return try {
        val now = System.currentTimeMillis()
        val start = java.time.Instant.parse(startAt).toEpochMilli()
        val end = java.time.Instant.parse(endAt).toEpochMilli()
        now in start..end
    } catch (_: Exception) {
        false
    }
}

/** Extract HH:mm from ISO timestamp */
private fun formatTime(isoTimestamp: String): String {
    return try {
        val instant = java.time.Instant.parse(isoTimestamp)
        val local = java.time.LocalDateTime.ofInstant(instant, java.time.ZoneId.systemDefault())
        String.format("%02d:%02d", local.hour, local.minute)
    } catch (_: Exception) {
        isoTimestamp.take(16)
    }
}
