package com.opentivi.phone.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

@Composable
fun ChannelLogo(
    logoUrl: String?,
    channelName: String,
    size: Int = 48,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(8.dp)
    if (!logoUrl.isNullOrEmpty()) {
        AsyncImage(
            model = logoUrl,
            contentDescription = channelName,
            modifier = modifier
                .size(size.dp)
                .clip(shape),
            contentScale = ContentScale.Fit,
        )
    } else {
        Box(
            modifier = modifier
                .size(size.dp)
                .clip(shape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Tv,
                contentDescription = channelName,
                modifier = Modifier.size((size * 0.4f).dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
