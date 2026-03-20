package com.opentivi.tv.ui.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.Card
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Tab
import androidx.tv.material3.TabRow
import androidx.tv.material3.Text
import com.opentivi.tv.R

@Composable
fun ImportDialog(
    onDismiss: () -> Unit,
    onImportM3u: (name: String, url: String) -> Unit,
    onImportXtream: (name: String, server: String, username: String, password: String) -> Unit,
) {
    var selectedTab by remember { mutableIntStateOf(0) }

    // M3U fields
    var m3uName by remember { mutableStateOf("") }
    var m3uUrl by remember { mutableStateOf("") }

    // Xtream fields
    var xtreamName by remember { mutableStateOf("") }
    var xtreamServer by remember { mutableStateOf("") }
    var xtreamUsername by remember { mutableStateOf("") }
    var xtreamPassword by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.5f)),
            contentAlignment = Alignment.Center,
        ) {
            Card(
                onClick = {},
                modifier = Modifier
                    .fillMaxWidth(0.5f)
                    .padding(32.dp),
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text(
                        text = stringResource(R.string.sources_add),
                        style = MaterialTheme.typography.headlineSmall,
                    )

                    TabRow(selectedTabIndex = selectedTab) {
                        Tab(
                            selected = selectedTab == 0,
                            onFocus = { selectedTab = 0 },
                            onClick = { selectedTab = 0 },
                        ) {
                            Text(
                                "M3U",
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }
                        Tab(
                            selected = selectedTab == 1,
                            onFocus = { selectedTab = 1 },
                            onClick = { selectedTab = 1 },
                        ) {
                            Text(
                                stringResource(R.string.sources_tab_xtream),
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }
                    }

                    when (selectedTab) {
                        0 -> {
                            OutlinedTextField(
                                value = m3uName,
                                onValueChange = { m3uName = it },
                                label = { Text(stringResource(R.string.sources_form_name)) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = m3uUrl,
                                onValueChange = { m3uUrl = it },
                                label = { Text(stringResource(R.string.sources_form_location)) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        1 -> {
                            OutlinedTextField(
                                value = xtreamName,
                                onValueChange = { xtreamName = it },
                                label = { Text(stringResource(R.string.sources_form_name)) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = xtreamServer,
                                onValueChange = { xtreamServer = it },
                                label = { Text(stringResource(R.string.sources_form_server_url)) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = xtreamUsername,
                                onValueChange = { xtreamUsername = it },
                                label = { Text(stringResource(R.string.sources_form_username)) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = xtreamPassword,
                                onValueChange = { xtreamPassword = it },
                                label = { Text(stringResource(R.string.sources_form_password)) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                    ) {
                        Button(onClick = onDismiss) {
                            Text(stringResource(R.string.cancel))
                        }
                        Button(
                            onClick = {
                                when (selectedTab) {
                                    0 -> onImportM3u(m3uName, m3uUrl)
                                    1 -> onImportXtream(xtreamName, xtreamServer, xtreamUsername, xtreamPassword)
                                }
                            },
                        ) {
                            Text(
                                when (selectedTab) {
                                    0 -> stringResource(R.string.sources_import_m3u)
                                    else -> stringResource(R.string.sources_import_xtream)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
