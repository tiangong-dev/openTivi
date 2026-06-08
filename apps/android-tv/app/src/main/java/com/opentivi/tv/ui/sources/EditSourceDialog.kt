package com.opentivi.tv.ui.sources

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
                    .clickable(onClick = {})
                    .clip(RoundedCornerShape(16.dp))
                    .background(TiviPopover)
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(
                    text = stringResource(R.string.sources_edit_title),
                    style = MaterialTheme.typography.headlineSmall,
                )

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

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    OutlinedButton(onClick = onDismiss) {
                        Text(stringResource(R.string.cancel))
                    }
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
                }
            }
        }
    }
}
