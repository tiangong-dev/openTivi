package com.opentivi.tv.viewmodel

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
import uniffi.opentivi.RecentChannelInfo
import javax.inject.Inject

@HiltViewModel
class RecentsViewModel @Inject constructor() : ViewModel() {

    private val _recents = MutableStateFlow<List<RecentChannelInfo>>(emptyList())
    val recents: StateFlow<List<RecentChannelInfo>> = _recents.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    init {
        loadRecents()
    }

    fun loadRecents() {
        viewModelScope.launch {
            _loading.value = true
            try {
                val list = withContext(Dispatchers.IO) {
                    Opentivi.listRecents()
                }
                _recents.value = list
            } catch (_: Exception) {
                _recents.value = emptyList()
            } finally {
                _loading.value = false
            }
        }
    }
}
