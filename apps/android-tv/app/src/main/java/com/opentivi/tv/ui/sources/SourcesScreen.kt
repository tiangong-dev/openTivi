package com.opentivi.tv.ui.sources

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.Button
import androidx.tv.material3.Card
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.opentivi.tv.R
import com.opentivi.tv.viewmodel.SourcesViewModel

@Composable
fun SourcesScreen(
    modifier: Modifier = Modifier,
    viewModel: SourcesViewModel = hiltViewModel(),
) {
    val sources by viewModel.sources.collectAsState()
    var showImportDialog by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 48.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = stringResource(R.string.sources_title),
                style = MaterialTheme.typography.headlineLarge,
            )
            Button(onClick = { showImportDialog = true }) {
                Text(stringResource(R.string.sources_add))
            }
        }

        if (sources.isEmpty()) {
            Text(
                text = stringResource(R.string.sources_empty),
                style = MaterialTheme.typography.bodyLarge,
            )
        }

        // TODO: Populate list with sources from Rust bridge
        TvLazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // TODO: items from viewModel.sources
        }
    }

    if (showImportDialog) {
        ImportDialog(
            onDismiss = { showImportDialog = false },
            onImportM3u = { name, url ->
                viewModel.importM3u(name, url)
                showImportDialog = false
            },
            onImportXtream = { name, server, username, password ->
                viewModel.importXtream(name, server, username, password)
                showImportDialog = false
            },
        )
    }
}
