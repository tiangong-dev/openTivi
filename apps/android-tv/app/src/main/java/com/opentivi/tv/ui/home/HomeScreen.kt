package com.opentivi.tv.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.tv.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.foundation.clickable
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.opentivi.tv.R
import com.opentivi.tv.ui.components.TvRow
import com.opentivi.tv.ui.components.TvRowItem
import com.opentivi.tv.ui.theme.TiviBackground
import com.opentivi.tv.ui.theme.TiviCard
import com.opentivi.tv.ui.theme.TiviPrimary
import com.opentivi.tv.viewmodel.FavoritesViewModel
import com.opentivi.tv.viewmodel.RecentsViewModel

@Composable
fun HomeScreen(
    onChannelClick: (Long) -> Unit,
    modifier: Modifier = Modifier,
    recentsViewModel: RecentsViewModel = hiltViewModel(),
    favoritesViewModel: FavoritesViewModel = hiltViewModel(),
) {
    val recents by recentsViewModel.recents.collectAsState()
    val favorites by favoritesViewModel.favorites.collectAsState()

    val continueItems = recents.map {
        TvRowItem(
            id = it.id,
            title = it.name,
            subtitle = it.lastWatchedAt,
        )
    }
    val favoriteItems = favorites.map {
        TvRowItem(
            id = it.channel.id,
            title = it.channel.name,
            subtitle = it.nowTitle,
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(36.dp),
    ) {
        // Hero Section — last watched channel
        if (recents.isNotEmpty()) {
            val hero = recents.first()
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(260.dp)
                    .clickable { onChannelClick(hero.id) },
                colors = CardDefaults.cardColors(containerColor = TiviCard),
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    // Gradient background
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(
                                        TiviPrimary.copy(alpha = 0.25f),
                                        TiviBackground.copy(alpha = 0.6f),
                                    ),
                                ),
                            ),
                    )
                    // Channel logo (faded, large, right side)
                    if (!hero.logoUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = hero.logoUrl,
                            contentDescription = null,
                            modifier = Modifier
                                .size(160.dp)
                                .align(Alignment.CenterEnd)
                                .padding(end = 48.dp),
                            contentScale = ContentScale.Fit,
                            alpha = 0.3f,
                        )
                    }
                    // Text content
                    Column(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(32.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.home_continue_watching),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = hero.name,
                            style = MaterialTheme.typography.headlineLarge,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                                tint = MaterialTheme.colorScheme.primary,
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = stringResource(R.string.home_hero_resume),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
            }
        } else {
            // No recents — show app title
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineLarge,
            )
        }

        TvRow(
            title = stringResource(R.string.home_continue_watching),
            rowItems = continueItems,
            onItemClick = onChannelClick,
        )

        TvRow(
            title = stringResource(R.string.home_favorites),
            rowItems = favoriteItems,
            onItemClick = onChannelClick,
        )
    }
}
