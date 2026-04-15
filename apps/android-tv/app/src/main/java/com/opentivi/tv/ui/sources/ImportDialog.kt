package com.opentivi.tv.ui.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.theme.TiviBackground
import com.opentivi.tv.ui.theme.TiviPopover

@Composable
fun ImportDialog(
    onDismiss: () -> Unit,
    onImportM3u: (name: String, url: String, autoRefreshMinutes: UInt?) -> Unit,
    onImportXtream: (name: String, server: String, username: String, password: String) -> Unit,
    onImportXmltv: (name: String, location: String) -> Unit,
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    var m3uName by remember { mutableStateOf("") }
    var m3uUrl by remember { mutableStateOf("") }
    var m3uAutoRefresh by remember { mutableStateOf(false) }
    var m3uAutoRefreshMinutes by remember { mutableStateOf("60") }

    var xtreamName by remember { mutableStateOf("") }
    var xtreamServer by remember { mutableStateOf("") }
    var xtreamUsername by remember { mutableStateOf("") }
    var xtreamPassword by remember { mutableStateOf("") }

    var xmltvName by remember { mutableStateOf("") }
    var xmltvLocation by remember { mutableStateOf("") }

    val tabLabels = listOf("M3U", stringResource(R.string.sources_tab_xtream), stringResource(R.string.sources_tab_xmltv))

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(TiviBackground.copy(alpha = 0.72f))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .widthIn(min = 400.dp, max = 600.dp)
                    .clickable(onClick = {}) // prevent dismiss on card click
                    .clip(RoundedCornerShape(16.dp))
                    .background(TiviPopover)
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    text = stringResource(R.string.sources_add),
                    style = MaterialTheme.typography.headlineSmall,
                )

                // Tab selector as simple row of buttons
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    tabLabels.forEachIndexed { index, label ->
                        if (selectedTab == index) {
                            Button(onClick = { selectedTab = index }) {
                                Text(label)
                            }
                        } else {
                            OutlinedButton(onClick = { selectedTab = index }) {
                                Text(label)
                            }
                        }
                    }
                }

                when (selectedTab) {
                    0 -> {
                        OutlinedTextField(
                            value = m3uName,
                            onValueChange = { m3uName = it },
                            label = { Text(stringResource(R.string.sources_form_name)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = m3uUrl,
                            onValueChange = { m3uUrl = it },
                            label = { Text(stringResource(R.string.sources_form_location)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = stringResource(R.string.sources_auto_refresh),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Switch(checked = m3uAutoRefresh, onCheckedChange = { m3uAutoRefresh = it })
                        }
                        if (m3uAutoRefresh) {
                            OutlinedTextField(
                                value = m3uAutoRefreshMinutes,
                                onValueChange = { m3uAutoRefreshMinutes = it.filter { c -> c.isDigit() } },
                                label = { Text(stringResource(R.string.sources_auto_refresh_minutes)) },
                                modifier = Modifier.fillMaxWidth(),
                                singleLine = true,
                            )
                        }
                    }
                    1 -> {
                        OutlinedTextField(
                            value = xtreamName,
                            onValueChange = { xtreamName = it },
                            label = { Text(stringResource(R.string.sources_form_name)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = xtreamServer,
                            onValueChange = { xtreamServer = it },
                            label = { Text(stringResource(R.string.sources_form_server_url)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = xtreamUsername,
                            onValueChange = { xtreamUsername = it },
                            label = { Text(stringResource(R.string.sources_form_username)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = xtreamPassword,
                            onValueChange = { xtreamPassword = it },
                            label = { Text(stringResource(R.string.sources_form_password)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                    else -> {
                        OutlinedTextField(
                            value = xmltvName,
                            onValueChange = { xmltvName = it },
                            label = { Text(stringResource(R.string.sources_form_name)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = xmltvLocation,
                            onValueChange = { xmltvLocation = it },
                            label = { Text(stringResource(R.string.sources_form_location)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    OutlinedButton(onClick = onDismiss) {
                        Text(stringResource(R.string.cancel))
                    }
                    Button(
                        onClick = {
                            when (selectedTab) {
                                0 -> {
                                    val refreshMin = if (m3uAutoRefresh) {
                                        m3uAutoRefreshMinutes.toUIntOrNull()
                                    } else {
                                        null
                                    }
                                    onImportM3u(m3uName, m3uUrl, refreshMin)
                                }
                                1 -> onImportXtream(xtreamName, xtreamServer, xtreamUsername, xtreamPassword)
                                else -> onImportXmltv(xmltvName, xmltvLocation)
                            }
                        },
                    ) {
                        Text(
                            when (selectedTab) {
                                0 -> stringResource(R.string.sources_import_m3u)
                                1 -> stringResource(R.string.sources_import_xtream)
                                else -> stringResource(R.string.sources_import_xmltv)
                            },
                        )
                    }
                }
            }
        }
    }
}
