package com.opentivi.tv.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

@Composable
fun TvRow(
    title: String,
    itemCount: Int,
    onItemClick: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
        )

        if (itemCount == 0) {
            Text(
                text = "—",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        TvLazyRow(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            items(itemCount) { index ->
                TvCard(
                    title = "Channel ${index + 1}", // TODO: Replace with actual channel data
                    subtitle = null,
                    onClick = { onItemClick(index.toLong()) },
                )
            }
        }
    }
}
