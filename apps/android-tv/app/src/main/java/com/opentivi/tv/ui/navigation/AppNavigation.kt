package com.opentivi.tv.ui.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.tv.material3.Tab
import androidx.tv.material3.TabRow
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.channels.ChannelsScreen
import com.opentivi.tv.ui.favorites.FavoritesScreen
import com.opentivi.tv.ui.home.HomeScreen
import com.opentivi.tv.ui.player.PlayerScreen
import com.opentivi.tv.ui.settings.SettingsScreen
import com.opentivi.tv.ui.sources.SourcesScreen

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    var selectedTabIndex by remember { mutableIntStateOf(0) }

    val tabs = listOf(
        stringResource(R.string.tab_home) to Screen.Home.route,
        stringResource(R.string.tab_channels) to Screen.Channels.route,
        stringResource(R.string.tab_favorites) to Screen.Favorites.route,
        stringResource(R.string.tab_settings) to Screen.Settings.route,
    )

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selectedTabIndex) {
            tabs.forEachIndexed { index, (title, route) ->
                Tab(
                    selected = selectedTabIndex == index,
                    onFocus = { selectedTabIndex = index },
                    onClick = {
                        selectedTabIndex = index
                        navController.navigate(route) {
                            popUpTo(Screen.Home.route) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                ) {
                    Text(
                        text = title,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
            }
        }

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
