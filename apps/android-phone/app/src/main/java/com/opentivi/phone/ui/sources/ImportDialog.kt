package com.opentivi.phone.ui.sources

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.opentivi.phone.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onImportM3u: (name: String, url: String) -> Unit,
    onImportXtream: (name: String, server: String, username: String, password: String) -> Unit,
    onImportXmltv: (name: String, location: String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf(
        stringResource(R.string.sources_tab_m3u),
        stringResource(R.string.sources_tab_xtream),
        stringResource(R.string.sources_tab_xmltv),
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 32.dp),
        ) {
            Text(
                text = stringResource(R.string.sources_add),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            )

            TabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = { Text(title) },
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 16.dp),
            ) {
                when (selectedTab) {
                    0 -> M3uForm(busy = busy, onImport = onImportM3u)
                    1 -> XtreamForm(busy = busy, onImport = onImportXtream)
                    2 -> XmltvForm(busy = busy, onImport = onImportXmltv)
                }
            }
        }
    }
}

@Composable
private fun M3uForm(
    busy: Boolean,
    onImport: (name: String, url: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }

    OutlinedTextField(
        value = name,
        onValueChange = { name = it },
        label = { Text(stringResource(R.string.sources_form_name)) },
        placeholder = { Text(stringResource(R.string.sources_form_m3u_placeholder)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
        value = url,
        onValueChange = { url = it },
        label = { Text(stringResource(R.string.sources_form_location)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Spacer(modifier = Modifier.height(16.dp))
    Button(
        onClick = { onImport(name.ifEmpty { "My IPTV" }, url) },
        modifier = Modifier.fillMaxWidth(),
        enabled = url.isNotBlank() && !busy,
    ) {
        if (busy) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterVertically))
        } else {
            Text(stringResource(R.string.sources_import_m3u))
        }
    }
}

@Composable
private fun XtreamForm(
    busy: Boolean,
    onImport: (name: String, server: String, username: String, password: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var server by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    OutlinedTextField(
        value = name,
        onValueChange = { name = it },
        label = { Text(stringResource(R.string.sources_form_name)) },
        placeholder = { Text(stringResource(R.string.sources_form_xtream_placeholder)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
        value = server,
        onValueChange = { server = it },
        label = { Text(stringResource(R.string.sources_form_server_url)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
        value = username,
        onValueChange = { username = it },
        label = { Text(stringResource(R.string.sources_form_username)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text(stringResource(R.string.sources_form_password)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
    )
    Spacer(modifier = Modifier.height(16.dp))
    Button(
        onClick = { onImport(name.ifEmpty { "My Xtream" }, server, username, password) },
        modifier = Modifier.fillMaxWidth(),
        enabled = server.isNotBlank() && username.isNotBlank() && password.isNotBlank() && !busy,
    ) {
        if (busy) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterVertically))
        } else {
            Text(stringResource(R.string.sources_import_xtream))
        }
    }
}

@Composable
private fun XmltvForm(
    busy: Boolean,
    onImport: (name: String, location: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }

    OutlinedTextField(
        value = name,
        onValueChange = { name = it },
        label = { Text(stringResource(R.string.sources_form_name)) },
        placeholder = { Text(stringResource(R.string.sources_form_xmltv_placeholder)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
        value = location,
        onValueChange = { location = it },
        label = { Text(stringResource(R.string.sources_form_xmltv_location)) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Spacer(modifier = Modifier.height(16.dp))
    Button(
        onClick = { onImport(name.ifEmpty { "My EPG" }, location) },
        modifier = Modifier.fillMaxWidth(),
        enabled = location.isNotBlank() && !busy,
    ) {
        if (busy) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterVertically))
        } else {
            Text(stringResource(R.string.sources_import_xmltv))
        }
    }
}
