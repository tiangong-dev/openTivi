package com.opentivi.phone.ui.sources

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.opentivi.phone.R
import uniffi.opentivi.SourceInfo

@Composable
fun EditSourceDialog(
    source: SourceInfo,
    onDismiss: () -> Unit,
    onSave: (
        sourceId: Long,
        name: String,
        location: String,
        username: String?,
        password: String?,
        autoRefreshMinutes: UInt?,
        enabled: Boolean,
    ) -> Unit,
) {
    var name by remember { mutableStateOf(source.name) }
    var location by remember { mutableStateOf(source.location) }
    var username by remember { mutableStateOf(source.username ?: "") }
    var password by remember { mutableStateOf(source.password ?: "") }
    var enabled by remember { mutableStateOf(source.enabled) }
    var autoRefreshEnabled by remember { mutableStateOf(source.autoRefreshMinutes != null) }
    var autoRefreshMinutes by remember {
        mutableStateOf(source.autoRefreshMinutes?.toString() ?: "60")
    }

    val isXtream = source.kind.equals("xtream", ignoreCase = true)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.sources_edit_title)) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.sources_form_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                OutlinedTextField(
                    value = location,
                    onValueChange = { location = it },
                    label = { Text(stringResource(R.string.sources_form_location)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )

                if (isXtream) {
                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text(stringResource(R.string.sources_form_username)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text(stringResource(R.string.sources_form_password)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.sources_enabled),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Switch(checked = enabled, onCheckedChange = { enabled = it })
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.sources_auto_refresh),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Switch(checked = autoRefreshEnabled, onCheckedChange = { autoRefreshEnabled = it })
                }

                if (autoRefreshEnabled) {
                    OutlinedTextField(
                        value = autoRefreshMinutes,
                        onValueChange = { autoRefreshMinutes = it.filter { c -> c.isDigit() } },
                        label = { Text(stringResource(R.string.sources_auto_refresh_minutes)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }

                // Read-only info
                source.lastRefreshError?.let { error ->
                    Text(
                        text = "${stringResource(R.string.sources_last_error)}: $error",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val refreshMin = if (autoRefreshEnabled) {
                        autoRefreshMinutes.toUIntOrNull()
                    } else {
                        null
                    }
                    onSave(
                        source.id,
                        name,
                        location,
                        if (isXtream) username.ifBlank { null } else null,
                        if (isXtream) password.ifBlank { null } else null,
                        refreshMin,
                        enabled,
                    )
                },
            ) {
                Text(stringResource(R.string.save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel))
            }
        },
    )
}
