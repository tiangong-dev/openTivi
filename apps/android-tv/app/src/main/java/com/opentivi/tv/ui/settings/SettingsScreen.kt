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
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.Card
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.viewmodel.SettingsViewModel

@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = stringResource(R.string.tab_settings),
            style = MaterialTheme.typography.headlineLarge,
        )

        TvLazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // General settings
            item {
                Text(
                    text = stringResource(R.string.settings_category_general),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(vertical = 8.dp),
                )
            }
            item {
                SettingsItem(
                    label = stringResource(R.string.settings_language),
                    value = "English",
                    onClick = { /* TODO: Open language picker */ },
                )
            }
            item {
                SettingsItem(
                    label = stringResource(R.string.settings_start_view),
                    value = stringResource(R.string.tab_channels),
                    onClick = { /* TODO: Open start view picker */ },
                )
            }

            // Playback settings
            item {
                Text(
                    text = stringResource(R.string.settings_category_playback),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                )
            }
            item {
                SettingsItem(
                    label = stringResource(R.string.settings_autoplay),
                    value = stringResource(R.string.settings_on),
                    onClick = { /* TODO: Toggle autoplay */ },
                )
            }

            // EPG settings
            item {
                Text(
                    text = stringResource(R.string.settings_category_epg),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                )
            }
            item {
                SettingsItem(
                    label = stringResource(R.string.settings_epg_auto_refresh),
                    value = stringResource(R.string.settings_on),
                    onClick = { /* TODO: Toggle EPG auto refresh */ },
                )
            }
        }
    }
}

@Composable
private fun SettingsItem(
    label: String,
    value: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyLarge,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}
