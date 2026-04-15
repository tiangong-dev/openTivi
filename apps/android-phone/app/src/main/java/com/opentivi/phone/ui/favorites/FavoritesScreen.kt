package com.opentivi.phone.ui.favorites

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.opentivi.phone.R
import com.opentivi.phone.ui.components.ChannelRow
import com.opentivi.phone.ui.components.EmptyState
import com.opentivi.phone.viewmodel.FavoritesViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    onChannelClick: (Long) -> Unit,
    viewModel: FavoritesViewModel = hiltViewModel(),
) {
    val favorites by viewModel.favorites.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()

    PullToRefreshBox(
        isRefreshing = loading,
        onRefresh = { viewModel.loadFavorites() },
        modifier = Modifier.fillMaxSize(),
    ) {
        if (favorites.isEmpty() && !loading) {
            EmptyState(
                icon = Icons.Outlined.StarOutline,
                title = stringResource(R.string.favorites_no_favorites),
                subtitle = stringResource(R.string.favorites_add_hint),
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
            ) {
                itemsIndexed(
                    items = favorites,
                    key = { _, item -> item.channel.id },
                ) { index, item ->
                    ChannelRow(
                        name = item.channel.name,
                        groupName = item.channel.groupName,
                        logoUrl = item.channel.logoUrl,
                        nowTitle = item.nowTitle,
                        channelNumber = null,
                        isFavorite = true,
                        onClick = { onChannelClick(item.channel.id) },
                    )
                    if (index < favorites.lastIndex) {
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
