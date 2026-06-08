package com.opentivi.phone.ui.recents

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.opentivi.phone.R
import com.opentivi.phone.ui.components.ChannelLogo
import com.opentivi.phone.ui.components.EmptyState
import com.opentivi.phone.util.formatTimeAgo
import com.opentivi.phone.viewmodel.RecentsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecentsScreen(
    onChannelClick: (Long) -> Unit,
    viewModel: RecentsViewModel = hiltViewModel(),
) {
    val recents by viewModel.recents.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()
    val context = LocalContext.current

    PullToRefreshBox(
        isRefreshing = loading,
        onRefresh = { viewModel.loadRecents() },
        modifier = Modifier.fillMaxSize(),
    ) {
        if (recents.isEmpty() && !loading) {
            EmptyState(
                icon = Icons.Filled.History,
                title = stringResource(R.string.recents_no_recents),
                subtitle = stringResource(R.string.recents_watch_hint),
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
            ) {
                itemsIndexed(
                    items = recents,
                    key = { _, item -> item.id },
                ) { index, recent ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onChannelClick(recent.id) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ChannelLogo(
                            logoUrl = recent.logoUrl,
                            channelName = recent.name,
                            size = 48,
                        )

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(
                            modifier = Modifier.weight(1f),
                        ) {
                            Text(
                                text = recent.name,
                                style = MaterialTheme.typography.titleLarge,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (recent.groupName != null) {
                                Text(
                                    text = recent.groupName!!,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }

                        Column(
                            horizontalAlignment = Alignment.End,
                        ) {
                            Text(
                                text = formatTimeAgo(context, recent.lastWatchedAt),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = stringResource(R.string.recents_played_count, recent.playCount.toInt()),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            )
                        }
                    }
                    if (index < recents.lastIndex) {
                        HorizontalDivider(
                            modifier = Modifier.padding(start = 76.dp),
                            color = MaterialTheme.colorScheme.outlineVariant,
                        )
                    }
                }
            }
        }
    }
}
