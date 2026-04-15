package com.opentivi.tv.ui.sources

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Storage
import androidx.tv.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.ui.theme.TiviCard
import com.opentivi.tv.ui.theme.TiviDestructive
import com.opentivi.tv.ui.theme.TiviPopover
import com.opentivi.tv.ui.theme.TiviWarning
import com.opentivi.tv.viewmodel.SourceStatusFilter
import com.opentivi.tv.viewmodel.SourcesViewModel
import uniffi.opentivi.SourceInfo

@Composable
fun SourcesScreen(
    modifier: Modifier = Modifier,
    viewModel: SourcesViewModel = hiltViewModel(),
) {
    val sources by viewModel.sources.collectAsState()
    val statusFilter by viewModel.statusFilter.collectAsState()
    val message by viewModel.message.collectAsState()
    var showImportDialog by remember { mutableStateOf(false) }
    var pendingDeleteId by remember { mutableStateOf<Long?>(null) }
    var editingSource by remember { mutableStateOf<SourceInfo?>(null) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.sources_title),
                style = MaterialTheme.typography.headlineLarge,
            )
            Button(onClick = { showImportDialog = true }) {
                Text(stringResource(R.string.sources_add))
            }
        }

        // Status filter chips
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val filters = listOf(
                SourceStatusFilter.ALL to R.string.sources_filter_all,
                SourceStatusFilter.ENABLED to R.string.sources_filter_enabled,
                SourceStatusFilter.DISABLED to R.string.sources_filter_disabled,
                SourceStatusFilter.BACKOFF to R.string.sources_filter_backoff,
                SourceStatusFilter.ERROR to R.string.sources_filter_error,
            )
            items(filters.size) { index ->
                val (filter, labelRes) = filters[index]
                FilterChip(
                    selected = statusFilter == filter,
                    onClick = { viewModel.setStatusFilter(filter) },
                    label = { Text(stringResource(labelRes)) },
                )
            }
        }

        message?.let { msg ->
            Text(
                text = msg,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        if (sources.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 64.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Storage,
                    contentDescription = null,
                    modifier = Modifier.size(72.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(R.string.sources_empty),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(onClick = { showImportDialog = true }) {
                    Text(stringResource(R.string.sources_add))
                }
            }
        }

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(sources.size) { index ->
                val s = sources[index]
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = TiviCard),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = s.name,
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (!s.enabled) {
                                    Text(
                                        text = stringResource(R.string.sources_status_disabled),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (s.nextRetryAt != null) {
                                    Text(
                                        text = stringResource(R.string.sources_status_backoff),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TiviWarning,
                                    )
                                }
                                if (s.lastRefreshError != null) {
                                    Text(
                                        text = stringResource(R.string.sources_status_error),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = TiviDestructive,
                                    )
                                }
                            }
                        }
                        Text(
                            text = "${s.kind.uppercase()} · ${s.channelCount} ch · ${s.groupCount} groups",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        s.lastImportedAt?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        s.lastRefreshError?.let { err ->
                            Text(
                                text = err,
                                style = MaterialTheme.typography.labelSmall,
                                color = TiviDestructive,
                            )
                        }
                        if (s.consecutiveRefreshFailures > 0u) {
                            Text(
                                text = stringResource(
                                    R.string.sources_failures,
                                    s.consecutiveRefreshFailures.toInt(),
                                ),
                                style = MaterialTheme.typography.labelSmall,
                                color = TiviWarning,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { viewModel.refreshSource(s.id) }) {
                                Text(stringResource(R.string.sources_refresh))
                            }
                            Button(onClick = { editingSource = s }) {
                                Text(stringResource(R.string.sources_edit))
                            }
                            Button(onClick = { pendingDeleteId = s.id }) {
                                Text(stringResource(R.string.sources_delete))
                            }
                        }
                    }
                }
            }
        }
    }

    if (showImportDialog) {
        ImportDialog(
            onDismiss = { showImportDialog = false },
            onImportM3u = { name, url, autoRefreshMinutes ->
                viewModel.importM3u(name, url, autoRefreshMinutes)
                showImportDialog = false
            },
            onImportXtream = { name, server, username, password ->
                viewModel.importXtream(name, server, username, password)
                showImportDialog = false
            },
            onImportXmltv = { name, location ->
                viewModel.importXmltv(name, location)
                showImportDialog = false
            },
        )
    }

    editingSource?.let { source ->
        EditSourceDialog(
            source = source,
            onDismiss = { editingSource = null },
            onSave = { sourceId, name, location, username, password, autoRefreshMinutes, enabled ->
                viewModel.updateSource(sourceId, name, location, username, password, autoRefreshMinutes, enabled)
                editingSource = null
            },
        )
    }

    pendingDeleteId?.let { id ->
        Dialog(onDismissRequest = { pendingDeleteId = null }) {
            Card(colors = CardDefaults.cardColors(containerColor = TiviPopover)) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text(
                        stringResource(R.string.sources_delete),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { pendingDeleteId = null }) {
                            Text(stringResource(R.string.cancel))
                        }
                        Button(onClick = {
                            viewModel.deleteSource(id)
                            pendingDeleteId = null
                        }) {
                            Text(stringResource(R.string.ok))
                        }
                    }
                }
            }
        }
    }
}
