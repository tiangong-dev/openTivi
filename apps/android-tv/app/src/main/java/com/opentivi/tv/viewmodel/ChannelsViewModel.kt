package com.opentivi.tv.viewmodel

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class ChannelsViewModel @Inject constructor() : ViewModel() {

    // TODO: Define Channel data class from Rust bridge types
    private val _channels = MutableStateFlow<List<Any>>(emptyList())
    val channels: StateFlow<List<Any>> = _channels.asStateFlow()

    private val _groups = MutableStateFlow<List<String>>(emptyList())
    val groups: StateFlow<List<String>> = _groups.asStateFlow()

    private val _selectedGroup = MutableStateFlow<String?>(null)
    val selectedGroup: StateFlow<String?> = _selectedGroup.asStateFlow()

    init {
        loadChannels()
    }

    fun loadChannels() {
        // TODO: Call Rust bridge to load channels
        // val channels = RustBridge.getChannels()
        // _channels.value = channels
        // _groups.value = channels.map { it.group }.distinct()
    }

    fun selectGroup(group: String?) {
        _selectedGroup.value = group
        // TODO: Filter channels by group via Rust bridge
    }

    fun searchChannels(query: String) {
        // TODO: Call Rust bridge to search channels
    }

    fun toggleFavorite(channelId: Long) {
        // TODO: Call Rust bridge to toggle favorite
    }
}
