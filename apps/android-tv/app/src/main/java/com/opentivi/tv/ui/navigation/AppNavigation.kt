package com.opentivi.tv.ui.navigation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Storage
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.tv.material3.Icon
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.channels.ChannelsScreen
import com.opentivi.tv.ui.epgsearch.EpgSearchScreen
import com.opentivi.tv.ui.favorites.FavoritesScreen
import com.opentivi.tv.ui.home.HomeScreen
import com.opentivi.tv.ui.player.PlayerScreen
import com.opentivi.tv.ui.recents.RecentsScreen
import com.opentivi.tv.ui.search.SearchScreen
import com.opentivi.tv.ui.settings.SettingsScreen
import com.opentivi.tv.ui.sources.SourcesScreen
import com.opentivi.tv.ui.theme.TiviBackground
import com.opentivi.tv.ui.theme.TiviCard
import com.opentivi.tv.ui.theme.TiviPrimary

private data class NavItem(
    val screen: Screen,
    val labelRes: Int,
    val icon: ImageVector,
)

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val isPlayerRoute = navBackStackEntry?.destination?.route == Screen.Player.route
    var selectedIndex by remember { mutableIntStateOf(0) }

    val navItems = listOf(
        NavItem(Screen.Home, R.string.tab_home, Icons.Default.Home),
        NavItem(Screen.Search, R.string.search_title, Icons.Default.Search),
        NavItem(Screen.Channels, R.string.tab_channels, Icons.Default.LiveTv),
        NavItem(Screen.Favorites, R.string.tab_favorites, Icons.Default.Favorite),
        NavItem(Screen.Recents, R.string.tab_recents, Icons.Default.History),
        NavItem(Screen.EpgSearch, R.string.epg_search_title, Icons.Default.Schedule),
        NavItem(Screen.Sources, R.string.sources_title, Icons.Default.Storage),
        NavItem(Screen.Settings, R.string.tab_settings, Icons.Default.Settings),
    )

    // Subtle dynamic background tint based on selected section
    val bgTint by animateColorAsState(
        targetValue = when (selectedIndex) {
            0 -> TiviPrimary.copy(alpha = 0.04f)
            1 -> TiviPrimary.copy(alpha = 0.06f)
            3 -> TiviPrimary.copy(alpha = 0.03f) // Favorites
            else -> TiviPrimary.copy(alpha = 0.02f)
        },
        animationSpec = tween(600),
        label = "bgTint",
    )

    CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onBackground) {
        Row(modifier = Modifier.fillMaxSize()) {
            // Side navigation rail — hidden during playback for full-screen experience
            if (!isPlayerRoute) {
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(64.dp)
                        .background(TiviCard)
                        .verticalScroll(rememberScrollState())
                        .padding(vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    navItems.forEachIndexed { index, item ->
                    val isSelected = selectedIndex == index
                    var isFocused by remember { mutableStateOf(false) }
                    val itemBg = when {
                        isFocused -> MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)
                        isSelected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                        else -> TiviCard
                    }
                    val iconTint by animateColorAsState(
                        targetValue = when {
                            isFocused || isSelected -> MaterialTheme.colorScheme.primary
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        label = "iconTint",
                    )
                    val borderMod = if (isFocused) {
                        Modifier.border(2.dp, MaterialTheme.colorScheme.primary, CircleShape)
                    } else {
                        Modifier
                    }
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .then(borderMod)
                            .background(itemBg)
                            .onFocusChanged { isFocused = it.isFocused }
                            .clickable {
                                selectedIndex = index
                                navController.navigate(item.screen.route) {
                                    popUpTo(Screen.Home.route) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = stringResource(item.labelRes),
                            tint = iconTint,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
            }
            }

            // Main content area
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(bgTint, TiviBackground),
                            radius = 1400f,
                        ),
                    ),
            ) {
                NavHost(
                    navController = navController,
                    startDestination = Screen.Home.route,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    composable(Screen.Home.route) {
                        HomeScreen(
                            onChannelClick = { channelId ->
                                navController.navigate(Screen.Player.createRoute(channelId))
                            },
                        )
                    }
                    composable(Screen.Search.route) {
                        SearchScreen(
                            onChannelClick = { channelId ->
                                navController.navigate(Screen.Player.createRoute(channelId))
                            },
                        )
                    }
                    composable(Screen.Channels.route) {
                        ChannelsScreen(
                            onChannelClick = { channelId ->
                                navController.navigate(Screen.Player.createRoute(channelId))
                            },
                        )
                    }
                    composable(Screen.Favorites.route) {
                        FavoritesScreen(
                            onChannelClick = { channelId ->
                                navController.navigate(Screen.Player.createRoute(channelId))
                            },
                        )
                    }
                    composable(Screen.Recents.route) {
                        RecentsScreen(
                            onChannelClick = { channelId ->
                                navController.navigate(Screen.Player.createRoute(channelId))
                            },
                        )
                    }
                    composable(Screen.EpgSearch.route) {
                        EpgSearchScreen(
                            onChannelClick = { channelId ->
                                navController.navigate(Screen.Player.createRoute(channelId))
                            },
                        )
                    }
                    composable(Screen.Sources.route) {
                        SourcesScreen()
                    }
                    composable(Screen.Settings.route) {
                        SettingsScreen()
                    }
                    composable(
                        route = Screen.Player.route,
                        arguments = listOf(navArgument("channelId") { type = NavType.LongType }),
                    ) { backStackEntry ->
                        val channelId = backStackEntry.arguments?.getLong("channelId") ?: 0L
                        PlayerScreen(
                            channelId = channelId,
                            onBack = { navController.popBackStack() },
                        )
                    }
                }
            }
        }
    }
}
