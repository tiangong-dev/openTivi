package com.opentivi.phone.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.opentivi.Opentivi
import com.opentivi.phone.util.jsonString
import com.opentivi.phone.util.parseJsonStringSetting
import javax.inject.Inject

private const val LOCALE_SETTING_KEY = "ui.locale"
private const val APP_START_VIEW_SETTING_KEY = "app.startView"
private const val INSTANT_SWITCH_ENABLED_SETTING_KEY = "player.instantSwitchEnabled"
private const val PREFER_NATIVE_HLS_SETTING_KEY = "player.preferNativeHls"

@HiltViewModel
class SettingsViewModel @Inject constructor() : ViewModel() {

    private val _languageCode = MutableStateFlow("en-US")
    val languageCode: StateFlow<String> = _languageCode.asStateFlow()

    private val _startView = MutableStateFlow("channels")
    val startView: StateFlow<String> = _startView.asStateFlow()

    private val _instantSwitch = MutableStateFlow(false)
    val instantSwitch: StateFlow<Boolean> = _instantSwitch.asStateFlow()

    private val _preferNativeHls = MutableStateFlow(true)
    val preferNativeHls: StateFlow<Boolean> = _preferNativeHls.asStateFlow()

    init {
        loadSettings()
    }

    fun loadSettings() {
        viewModelScope.launch {
            try {
                val settings = withContext(Dispatchers.IO) {
                    Opentivi.getAllSettings()
                }
                val map = settings.associateBy { it.key }
                map[LOCALE_SETTING_KEY]?.value?.let { raw ->
                    val parsed = parseJsonStringSetting(raw)
                    if (parsed == "en-US" || parsed == "zh-CN") {
                        _languageCode.value = parsed
                    }
                }
                map[APP_START_VIEW_SETTING_KEY]?.value?.let { raw ->
                    val parsed = parseJsonStringSetting(raw)
                    if (parsed.isNotEmpty()) {
                        _startView.value = parsed
                    }
                }
                map[INSTANT_SWITCH_ENABLED_SETTING_KEY]?.value?.let { raw ->
                    _instantSwitch.value = raw.trim().equals("true", ignoreCase = true)
                }
                map[PREFER_NATIVE_HLS_SETTING_KEY]?.value?.let { raw ->
                    _preferNativeHls.value = raw.trim().equals("true", ignoreCase = true)
                }
            } catch (_: Exception) {
            }
        }
    }

    fun setLanguageCode(code: String) {
        if (code != "en-US" && code != "zh-CN") return
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.setSetting(LOCALE_SETTING_KEY, jsonString(code))
                }
                _languageCode.value = code
            } catch (_: Exception) {
            }
        }
    }

    fun setStartView(view: String) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.setSetting(APP_START_VIEW_SETTING_KEY, jsonString(view))
                }
                _startView.value = view
            } catch (_: Exception) {
            }
        }
    }

    fun setInstantSwitch(enabled: Boolean) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.setSetting(INSTANT_SWITCH_ENABLED_SETTING_KEY, if (enabled) "true" else "false")
                }
                _instantSwitch.value = enabled
            } catch (_: Exception) {
            }
        }
    }

    fun setPreferNativeHls(enabled: Boolean) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.setSetting(PREFER_NATIVE_HLS_SETTING_KEY, if (enabled) "true" else "false")
                }
                _preferNativeHls.value = enabled
            } catch (_: Exception) {
            }
        }
    }
}
