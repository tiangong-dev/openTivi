package com.opentivi.tv.ui.navigation

sealed class Screen(val route: String) {
    data object Home : Screen("home")
    data object Channels : Screen("channels")
    data object Favorites : Screen("favorites")
    data object Sources : Screen("sources")
    data object Settings : Screen("settings")
    data object Player : Screen("player/{channelId}") {
        fun createRoute(channelId: Long) = "player/$channelId"
    }
}
