package com.opentivi.tv.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.foundation.clickable
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.theme.TiviCard
import com.opentivi.tv.viewmodel.SettingsViewModel

@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val languageCode by viewModel.languageCode.collectAsState()
    val startView by viewModel.startView.collectAsState()
    val instantSwitch by viewModel.instantSwitch.collectAsState()
    val preferNativeHls by viewModel.preferNativeHls.collectAsState()
    val epgGuideWindow by viewModel.epgGuideWindowMinutes.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(48.dp),
    ) {
        Text(
            text = stringResource(R.string.tab_settings),
            style = MaterialTheme.typography.headlineLarge,
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                Text(
                    text = stringResource(R.string.settings_category_general),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
            item {
                SettingsLabeledCard(
                    label = stringResource(R.string.settings_language),
                    value = languageCode,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { viewModel.setLanguageCode("en-US") }) {
                            Text("English")
                        }
                        Button(onClick = { viewModel.setLanguageCode("zh-CN") }) {
                            Text("中文")
                        }
                    }
                }
            }
            item {
                SettingsLabeledCard(
                    label = stringResource(R.string.settings_start_view),
                    value = startView,
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(
                            "home" to "Home",
                            "channels" to "Channels",
                            "favorites" to "Favorites",
                            "recents" to "Recents",
                            "sources" to "Sources",
                            "settings" to "Settings",
                        ).forEach { (key, label) ->
                            Button(onClick = { viewModel.setStartView(key) }) {
                                Text(label)
                            }
                        }
                    }
                }
            }

            item {
                Text(
                    text = stringResource(R.string.settings_category_playback),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                )
            }
            item {
                SettingsToggleCard(
                    label = stringResource(R.string.settings_instant_switch),
                    enabled = instantSwitch,
                    onToggle = { viewModel.setInstantSwitch(!instantSwitch) },
                )
            }
            item {
                SettingsToggleCard(
                    label = stringResource(R.string.settings_prefer_native_hls),
                    enabled = preferNativeHls,
                    onToggle = { viewModel.setPreferNativeHls(!preferNativeHls) },
                )
            }

            item {
                Text(
                    text = stringResource(R.string.settings_category_epg),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                )
            }
            item {
                SettingsLabeledCard(
                    label = stringResource(R.string.settings_epg_guide_window),
                    value = stringResource(R.string.settings_epg_guide_window_value, epgGuideWindow),
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(60, 90, 120, 180, 240, 360).forEach { minutes ->
                            Button(onClick = { viewModel.setEpgGuideWindowMinutes(minutes) }) {
                                Text("${minutes}m")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsLabeledCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    actions: @Composable () -> Unit,
) {
    Card(modifier = modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = TiviCard)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = label, style = MaterialTheme.typography.titleSmall)
                Text(text = value, style = MaterialTheme.typography.bodySmall)
            }
            actions()
        }
    }
}

@Composable
private fun SettingsToggleCard(
    label: String,
    enabled: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier = modifier.fillMaxWidth().clickable(onClick = onToggle), colors = CardDefaults.cardColors(containerColor = TiviCard)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = label, style = MaterialTheme.typography.titleSmall)
            Text(
                text = if (enabled) {
                    stringResource(R.string.settings_on)
                } else {
                    stringResource(R.string.settings_off)
                },
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
