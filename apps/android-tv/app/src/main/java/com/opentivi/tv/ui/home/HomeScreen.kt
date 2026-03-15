package com.opentivi.tv.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.components.TvRow

@Composable
fun HomeScreen(
    onChannelClick: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineLarge,
        )

        // TODO: Populate with data from Rust bridge
        TvRow(
            title = stringResource(R.string.home_continue_watching),
            itemCount = 0,
            onItemClick = onChannelClick,
        )

        TvRow(
            title = stringResource(R.string.home_favorites),
            itemCount = 0,
            onItemClick = onChannelClick,
        )
    }
}
