package com.opentivi.tv.ui.channels

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Card
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text

@Composable
fun ChannelCard(
    channelName: String,
    currentProgram: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // TODO: Add channel logo with Coil AsyncImage
            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = channelName,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
            )

            if (currentProgram != null) {
                Text(
                    text = currentProgram,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                )
            }
        }
    }
}
