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
import uniffi.opentivi.EpgSearchResult
import uniffi.opentivi.Opentivi
import javax.inject.Inject

enum class EpgStateFilter { ALL, LIVE, UPCOMING }

@HiltViewModel
class EpgSearchViewModel @Inject constructor() : ViewModel() {

    private val _results = MutableStateFlow<List<EpgSearchResult>>(emptyList())
    val results: StateFlow<List<EpgSearchResult>> = _results.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _stateFilter = MutableStateFlow(EpgStateFilter.ALL)
    val stateFilter: StateFlow<EpgStateFilter> = _stateFilter.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
        search()
    }

    fun setStateFilter(filter: EpgStateFilter) {
        _stateFilter.value = filter
        search()
    }

    fun search() {
        val q = _searchQuery.value.trim().ifEmpty { null }
        val state = when (_stateFilter.value) {
            EpgStateFilter.ALL -> null
            EpgStateFilter.LIVE -> "live"
            EpgStateFilter.UPCOMING -> "upcoming"
        }
        viewModelScope.launch {
            _loading.value = true
            try {
                val list = withContext(Dispatchers.IO) {
                    Opentivi.searchEpg(search = q, state = state, limit = 200u)
                }
                _results.value = list
            } catch (_: Exception) {
                _results.value = emptyList()
            } finally {
                _loading.value = false
            }
        }
    }
}
