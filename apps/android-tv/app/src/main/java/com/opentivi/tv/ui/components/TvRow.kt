package com.opentivi.tv.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.lazy.LazyRow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

data class TvRowItem(
    val id: Long,
    val title: String,
    val subtitle: String?,
)

@Composable
fun TvRow(
    title: String,
    rowItems: List<TvRowItem>,
    onItemClick: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
        )

        if (rowItems.isEmpty()) {
            Text(
                text = "—",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            items(rowItems.size) { index ->
                val item = rowItems[index]
                TvCard(
                    title = item.title,
                    subtitle = item.subtitle,
                    onClick = { onItemClick(item.id) },
                )
            }
        }
    }
}
