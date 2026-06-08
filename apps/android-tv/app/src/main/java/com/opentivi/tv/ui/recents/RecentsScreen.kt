package com.opentivi.tv.ui.recents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.tv.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.channels.ChannelCard
import com.opentivi.tv.viewmodel.RecentsViewModel

@Composable
fun RecentsScreen(
    onChannelClick: (Long) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: RecentsViewModel = hiltViewModel(),
) {
    val recents by viewModel.recents.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(36.dp),
    ) {
        Text(
            text = stringResource(R.string.tab_recents),
            style = MaterialTheme.typography.headlineLarge,
        )

        if (recents.isEmpty()) {
            // TV-optimized empty state
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 64.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.History,
                    contentDescription = null,
                    modifier = Modifier.size(72.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(R.string.recents_empty),
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
            items(recents.size) { index ->
                val r = recents[index]
                ChannelCard(
                    channelName = r.name,
                    logoUrl = r.logoUrl,
                    currentProgram = stringResource(R.string.recents_play_count, r.playCount.toInt()),
                    onClick = { onChannelClick(r.id) },
                )
            }
        }
    }
}
