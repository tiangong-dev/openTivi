package com.opentivi.tv.viewmodel

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class SourcesViewModel @Inject constructor() : ViewModel() {

    // TODO: Define Source data class from Rust bridge types
    private val _sources = MutableStateFlow<List<Any>>(emptyList())
    val sources: StateFlow<List<Any>> = _sources.asStateFlow()

    init {
        loadSources()
    }

    fun loadSources() {
        // TODO: Call Rust bridge to load sources
        // val sources = RustBridge.getSources()
        // _sources.value = sources
    }

    fun importM3u(name: String, url: String) {
        // TODO: Call Rust bridge to import M3U source
        // RustBridge.importM3u(name, url)
        // loadSources()
    }

    fun importXtream(name: String, server: String, username: String, password: String) {
        // TODO: Call Rust bridge to import Xtream source
        // RustBridge.importXtream(name, server, username, password)
        // loadSources()
    }

    fun refreshSource(sourceId: Long) {
        // TODO: Call Rust bridge to refresh source
        // RustBridge.refreshSource(sourceId)
    }

    fun deleteSource(sourceId: Long) {
        // TODO: Call Rust bridge to delete source
        // RustBridge.deleteSource(sourceId)
        // loadSources()
    }
}
