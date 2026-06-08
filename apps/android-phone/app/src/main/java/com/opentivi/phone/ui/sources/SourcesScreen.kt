package com.opentivi.phone.ui.sources

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Source
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.opentivi.phone.R
import com.opentivi.phone.ui.components.EmptyState
import com.opentivi.phone.viewmodel.SourceStatusFilter
import com.opentivi.phone.viewmodel.SourcesViewModel
import uniffi.opentivi.SourceInfo

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourcesScreen(
    viewModel: SourcesViewModel = hiltViewModel(),
) {
    val sources by viewModel.sources.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val statusFilter by viewModel.statusFilter.collectAsStateWithLifecycle()

    var showImportDialog by remember { mutableStateOf(false) }
    var deleteConfirmSource by remember { mutableStateOf<SourceInfo?>(null) }
    var editSource by remember { mutableStateOf<SourceInfo?>(null) }

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(message) {
        message?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.sources_title)) },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showImportDialog = true },
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.sources_add),
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // Status filter chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = statusFilter == SourceStatusFilter.ALL,
                    onClick = { viewModel.setStatusFilter(SourceStatusFilter.ALL) },
                    label = { Text(stringResource(R.string.sources_filter_all)) },
                )
                FilterChip(
                    selected = statusFilter == SourceStatusFilter.ENABLED,
                    onClick = { viewModel.setStatusFilter(SourceStatusFilter.ENABLED) },
                    label = { Text(stringResource(R.string.sources_filter_enabled)) },
                )
                FilterChip(
                    selected = statusFilter == SourceStatusFilter.DISABLED,
                    onClick = { viewModel.setStatusFilter(SourceStatusFilter.DISABLED) },
                    label = { Text(stringResource(R.string.sources_filter_disabled)) },
                )
                FilterChip(
                    selected = statusFilter == SourceStatusFilter.ERROR,
                    onClick = { viewModel.setStatusFilter(SourceStatusFilter.ERROR) },
                    label = { Text(stringResource(R.string.sources_filter_error)) },
                )
            }

            if (sources.isEmpty() && !busy) {
                EmptyState(
                    icon = Icons.Filled.Source,
                    title = stringResource(R.string.sources_title),
                    subtitle = stringResource(R.string.sources_empty),
                )
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item { Spacer(modifier = Modifier.height(4.dp)) }
                    items(
                        items = sources,
                        key = { it.id },
                    ) { source ->
                        SourceCard(
                            source = source,
                            onRefresh = { viewModel.refreshSource(source.id) },
                            onDelete = { deleteConfirmSource = source },
                            onEdit = { editSource = source },
                        )
                    }
                    item { Spacer(modifier = Modifier.height(80.dp)) }
                }
            }
        }
    }

    // Import dialog
    if (showImportDialog) {
        ImportDialog(
            busy = busy,
            onDismiss = { showImportDialog = false },
            onImportM3u = { name, url ->
                viewModel.importM3u(name, url)
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

    // Edit dialog
    editSource?.let { source ->
        EditSourceDialog(
            source = source,
            onDismiss = { editSource = null },
            onSave = { sourceId, name, location, username, password, autoRefreshMinutes, enabled ->
                viewModel.updateSource(sourceId, name, location, username, password, autoRefreshMinutes, enabled)
                editSource = null
            },
        )
    }

    // Delete confirmation
    deleteConfirmSource?.let { source ->
        AlertDialog(
            onDismissRequest = { deleteConfirmSource = null },
            title = { Text(stringResource(R.string.sources_delete_confirm_title)) },
            text = { Text(stringResource(R.string.sources_delete_confirm_message, source.name)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteSource(source.id)
                        deleteConfirmSource = null
                    },
                ) {
                    Text(
                        stringResource(R.string.sources_delete),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteConfirmSource = null }) {
                    Text(stringResource(R.string.cancel))
                }
            },
        )
    }
}

@Composable
private fun SourceCard(
    source: SourceInfo,
    onRefresh: () -> Unit,
    onDelete: () -> Unit,
    onEdit: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = source.name,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Text(
                            text = source.kind.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        if (!source.enabled) {
                            Text(
                                text = stringResource(R.string.sources_badge_disabled),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        } else if (source.consecutiveRefreshFailures > 0u) {
                            Text(
                                text = stringResource(R.string.sources_badge_error),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }

                Row {
                    IconButton(onClick = onEdit) {
                        Icon(
                            imageVector = Icons.Filled.Edit,
                            contentDescription = stringResource(R.string.sources_edit),
                        )
                    }
                    IconButton(onClick = onRefresh) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.sources_refresh),
                        )
                    }
                    IconButton(onClick = onDelete) {
                        Icon(
                            imageVector = Icons.Filled.Delete,
                            contentDescription = stringResource(R.string.sources_delete),
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "${source.channelCount} channels \u00B7 ${source.groupCount} groups",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            source.lastImportedAt?.let { lastImport ->
                Text(
                    text = "Last import: $lastImport",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            source.lastRefreshError?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
