package com.opentivi.phone.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.NavigateNext
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.opentivi.phone.R
import com.opentivi.phone.viewmodel.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val languageCode by viewModel.languageCode.collectAsStateWithLifecycle()
    val startView by viewModel.startView.collectAsStateWithLifecycle()
    val instantSwitch by viewModel.instantSwitch.collectAsStateWithLifecycle()
    val preferNativeHls by viewModel.preferNativeHls.collectAsStateWithLifecycle()

    var showLanguageDialog by remember { mutableStateOf(false) }
    var showStartViewDialog by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val packageInfo = try {
        context.packageManager.getPackageInfo(context.packageName, 0)
    } catch (_: Exception) {
        null
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tab_settings)) },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            // General section
            SettingsSectionHeader(stringResource(R.string.settings_category_general))

            SettingsClickableRow(
                title = stringResource(R.string.settings_language),
                value = if (languageCode == "zh-CN") stringResource(R.string.settings_language_zh) else stringResource(R.string.settings_language_en),
                onClick = { showLanguageDialog = true },
            )
            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            SettingsClickableRow(
                title = stringResource(R.string.settings_start_view),
                value = startView.replaceFirstChar { it.uppercase() },
                onClick = { showStartViewDialog = true },
            )
            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            // Playback section
            Spacer(modifier = Modifier.height(16.dp))
            SettingsSectionHeader(stringResource(R.string.settings_category_playback))

            SettingsToggleRow(
                title = stringResource(R.string.settings_instant_switch),
                checked = instantSwitch,
                onCheckedChange = { viewModel.setInstantSwitch(it) },
            )
            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            SettingsToggleRow(
                title = stringResource(R.string.settings_prefer_native_hls),
                checked = preferNativeHls,
                onCheckedChange = { viewModel.setPreferNativeHls(it) },
            )
            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            // About section
            Spacer(modifier = Modifier.height(16.dp))
            SettingsSectionHeader(stringResource(R.string.settings_category_about))

            SettingsInfoRow(
                title = stringResource(R.string.settings_version),
                value = packageInfo?.versionName ?: "0.1.0",
            )
            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))

            SettingsInfoRow(
                title = stringResource(R.string.settings_build),
                value = (packageInfo?.longVersionCode ?: 1).toString(),
            )

            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    // Language dialog
    if (showLanguageDialog) {
        AlertDialog(
            onDismissRequest = { showLanguageDialog = false },
            title = { Text(stringResource(R.string.settings_language)) },
            text = {
                Column {
                    TextButton(
                        onClick = {
                            viewModel.setLanguageCode("en-US")
                            showLanguageDialog = false
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            stringResource(R.string.settings_language_en),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    TextButton(
                        onClick = {
                            viewModel.setLanguageCode("zh-CN")
                            showLanguageDialog = false
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            stringResource(R.string.settings_language_zh),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showLanguageDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }

    // Start view dialog
    if (showStartViewDialog) {
        val views = listOf("channels", "favorites", "recents", "sources")
        AlertDialog(
            onDismissRequest = { showStartViewDialog = false },
            title = { Text(stringResource(R.string.settings_start_view)) },
            text = {
                Column {
                    views.forEach { view ->
                        TextButton(
                            onClick = {
                                viewModel.setStartView(view)
                                showStartViewDialog = false
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                view.replaceFirstChar { it.uppercase() },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showStartViewDialog = false }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun SettingsSectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
private fun SettingsClickableRow(
    title: String,
    value: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                imageVector = Icons.AutoMirrored.Filled.NavigateNext,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SettingsToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
        )
    }
}

@Composable
private fun SettingsInfoRow(
    title: String,
    value: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
