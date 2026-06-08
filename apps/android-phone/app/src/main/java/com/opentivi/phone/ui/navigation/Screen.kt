package com.opentivi.phone.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Source
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Source
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.ui.graphics.vector.ImageVector
import com.opentivi.phone.R

sealed class Screen(
    val route: String,
    val labelResId: Int,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
) {
    data object Channels : Screen(
        route = "channels",
        labelResId = R.string.tab_channels,
        selectedIcon = Icons.Filled.LiveTv,
        unselectedIcon = Icons.Outlined.LiveTv,
    )
    data object Favorites : Screen(
        route = "favorites",
        labelResId = R.string.tab_favorites,
        selectedIcon = Icons.Filled.Star,
        unselectedIcon = Icons.Outlined.StarOutline,
    )
    data object Recents : Screen(
        route = "recents",
        labelResId = R.string.tab_recents,
        selectedIcon = Icons.Filled.History,
        unselectedIcon = Icons.Outlined.History,
    )
    data object Sources : Screen(
        route = "sources",
        labelResId = R.string.tab_sources,
        selectedIcon = Icons.Filled.Source,
        unselectedIcon = Icons.Outlined.Source,
    )
    data object Settings : Screen(
        route = "settings",
        labelResId = R.string.tab_settings,
        selectedIcon = Icons.Filled.Settings,
        unselectedIcon = Icons.Outlined.Settings,
    )
    data object Player : Screen(
        route = "player/{channelId}",
        labelResId = R.string.player_now_playing,
        selectedIcon = Icons.Filled.LiveTv,
        unselectedIcon = Icons.Outlined.LiveTv,
    ) {
        fun createRoute(channelId: Long) = "player/$channelId"
    }
    data object EpgSearch : Screen(
        route = "epg_search",
        labelResId = R.string.epg_search_title,
        selectedIcon = Icons.Filled.LiveTv,
        unselectedIcon = Icons.Outlined.LiveTv,
    )

    companion object {
        val bottomNavItems = listOf(Channels, Favorites, Recents, Sources, Settings)
    }
}
