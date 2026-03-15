package com.opentivi.tv.viewmodel

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor() : ViewModel() {

    private val _language = MutableStateFlow("en")
    val language: StateFlow<String> = _language.asStateFlow()

    private val _autoplay = MutableStateFlow(true)
    val autoplay: StateFlow<Boolean> = _autoplay.asStateFlow()

    private val _epgAutoRefresh = MutableStateFlow(true)
    val epgAutoRefresh: StateFlow<Boolean> = _epgAutoRefresh.asStateFlow()

    private val _startView = MutableStateFlow("channels")
    val startView: StateFlow<String> = _startView.asStateFlow()

    init {
        loadSettings()
    }

    fun loadSettings() {
        // TODO: Call Rust bridge to load settings
        // val settings = RustBridge.getSettings()
        // _language.value = settings.language
        // _autoplay.value = settings.autoplay
        // _epgAutoRefresh.value = settings.epgAutoRefresh
        // _startView.value = settings.startView
    }

    fun setLanguage(language: String) {
        _language.value = language
        // TODO: Call Rust bridge to save setting
    }

    fun setAutoplay(enabled: Boolean) {
        _autoplay.value = enabled
        // TODO: Call Rust bridge to save setting
    }

    fun setEpgAutoRefresh(enabled: Boolean) {
        _epgAutoRefresh.value = enabled
        // TODO: Call Rust bridge to save setting
    }

    fun setStartView(view: String) {
        _startView.value = view
        // TODO: Call Rust bridge to save setting
    }
}
