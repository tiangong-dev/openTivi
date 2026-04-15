package com.opentivi.phone.ui.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.opentivi.phone.ui.channels.ChannelsScreen
import com.opentivi.phone.ui.components.MiniPlayerBar
import com.opentivi.phone.ui.epgsearch.EpgSearchScreen
import com.opentivi.phone.ui.favorites.FavoritesScreen
import com.opentivi.phone.ui.player.PlayerScreen
import com.opentivi.phone.ui.recents.RecentsScreen
import com.opentivi.phone.ui.settings.SettingsScreen
import com.opentivi.phone.ui.sources.SourcesScreen
import com.opentivi.phone.viewmodel.PlayerViewModel

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val playerViewModel: PlayerViewModel = hiltViewModel()
    val currentChannelName by playerViewModel.channelName.collectAsStateWithLifecycle()
    val currentProgram by playerViewModel.currentProgram.collectAsStateWithLifecycle()
    val isPlayingChannel = currentChannelName.isNotEmpty()

    val isPlayerScreen = currentRoute?.startsWith("player") == true
    val isEpgSearch = currentRoute == Screen.EpgSearch.route
    val showBottomBar = !isPlayerScreen && !isEpgSearch

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            AnimatedVisibility(
                visible = showBottomBar,
                enter = slideInVertically(initialOffsetY = { it }),
                exit = slideOutVertically(targetOffsetY = { it }),
            ) {
                Column {
                    // Mini player bar
                    if (isPlayingChannel) {
                        MiniPlayerBar(
                            channelName = currentChannelName,
                            programTitle = currentProgram,
                            isPlaying = playerViewModel.exoPlayer.isPlaying,
                            onPlayPause = {
                                if (playerViewModel.exoPlayer.isPlaying) {
                                    playerViewModel.exoPlayer.pause()
                                } else {
                                    playerViewModel.exoPlayer.play()
                                }
                            },
                            onExpand = {
                                val channelId = playerViewModel.currentChannelId
                                if (channelId != null) {
                                    navController.navigate(Screen.Player.createRoute(channelId))
                                }
                            },
                        )
                    }

                    NavigationBar {
                        Screen.bottomNavItems.forEach { screen ->
                            val selected = currentRoute == screen.route
                            NavigationBarItem(
                                selected = selected,
                                onClick = {
                                    if (currentRoute != screen.route) {
                                        navController.navigate(screen.route) {
                                            popUpTo(navController.graph.findStartDestination().id) {
                                                saveState = true
                                            }
                                            launchSingleTop = true
                                            restoreState = true
                                        }
                                    }
                                },
                                icon = {
                                    Icon(
                                        imageVector = if (selected) screen.selectedIcon else screen.unselectedIcon,
                                        contentDescription = stringResource(screen.labelResId),
                                    )
                                },
                                label = {
                                    Text(
                                        text = stringResource(screen.labelResId),
                                        style = MaterialTheme.typography.labelSmall,
                                    )
                                },
                            )
                        }
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Channels.route,
            modifier = if (showBottomBar) Modifier.padding(innerPadding) else Modifier,
        ) {
            composable(Screen.Channels.route) {
                ChannelsScreen(
                    onChannelClick = { channelId ->
                        playerViewModel.loadChannel(channelId)
                        navController.navigate(Screen.Player.createRoute(channelId))
                    },
                    onEpgSearch = {
                        navController.navigate(Screen.EpgSearch.route)
                    },
                )
            }
            composable(Screen.Favorites.route) {
                FavoritesScreen(
                    onChannelClick = { channelId ->
                        playerViewModel.loadChannel(channelId)
                        navController.navigate(Screen.Player.createRoute(channelId))
                    },
                )
            }
            composable(Screen.Recents.route) {
                RecentsScreen(
                    onChannelClick = { channelId ->
                        playerViewModel.loadChannel(channelId)
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
            composable(Screen.EpgSearch.route) {
                EpgSearchScreen(
                    onChannelClick = { channelId ->
                        playerViewModel.loadChannel(channelId)
                        navController.navigate(Screen.Player.createRoute(channelId))
                    },
                    onBack = { navController.popBackStack() },
                )
            }
            composable(
                route = Screen.Player.route,
                arguments = listOf(navArgument("channelId") { type = NavType.LongType }),
            ) { backStackEntry ->
                val channelId = backStackEntry.arguments?.getLong("channelId") ?: return@composable
                PlayerScreen(
                    channelId = channelId,
                    playerViewModel = playerViewModel,
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}
