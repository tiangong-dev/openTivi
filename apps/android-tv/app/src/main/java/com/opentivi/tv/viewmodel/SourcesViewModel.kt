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
import uniffi.opentivi.SourceInfo
import javax.inject.Inject

enum class SourceStatusFilter { ALL, ENABLED, DISABLED, BACKOFF, ERROR }

@HiltViewModel
class SourcesViewModel @Inject constructor() : ViewModel() {

    private val _allSources = MutableStateFlow<List<SourceInfo>>(emptyList())

    private val _sources = MutableStateFlow<List<SourceInfo>>(emptyList())
    val sources: StateFlow<List<SourceInfo>> = _sources.asStateFlow()

    private val _statusFilter = MutableStateFlow(SourceStatusFilter.ALL)
    val statusFilter: StateFlow<SourceStatusFilter> = _statusFilter.asStateFlow()

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _message = MutableStateFlow<String?>(null)
    val message: StateFlow<String?> = _message.asStateFlow()

    init {
        loadSources()
    }

    fun loadSources() {
        viewModelScope.launch {
            try {
                val list = withContext(Dispatchers.IO) {
                    Opentivi.listSources()
                }
                _allSources.value = list
                applyFilter()
            } catch (e: Exception) {
                _message.value = e.message
            }
        }
    }

    fun setStatusFilter(filter: SourceStatusFilter) {
        _statusFilter.value = filter
        applyFilter()
    }

    private fun applyFilter() {
        val all = _allSources.value
        val filter = _statusFilter.value
        _sources.value = when (filter) {
            SourceStatusFilter.ALL -> all
            SourceStatusFilter.ENABLED -> all.filter { it.enabled && it.nextRetryAt == null && it.lastRefreshError == null }
            SourceStatusFilter.DISABLED -> all.filter { !it.enabled }
            SourceStatusFilter.BACKOFF -> all.filter { it.nextRetryAt != null }
            SourceStatusFilter.ERROR -> all.filter { it.lastRefreshError != null }
        }
    }

    fun importM3u(name: String, url: String, autoRefreshMinutes: UInt?) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.importM3u(name = name, location = url, autoRefreshMinutes = autoRefreshMinutes)
                }
                loadSources()
            } catch (e: Exception) {
                _message.value = e.message ?: e.toString()
            } finally {
                _busy.value = false
            }
        }
    }

    fun importXtream(name: String, server: String, username: String, password: String) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.importXtream(name, server, username, password)
                }
                loadSources()
            } catch (e: Exception) {
                _message.value = e.message ?: e.toString()
            } finally {
                _busy.value = false
            }
        }
    }

    fun importXmltv(name: String, location: String) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.importXmltv(name, location)
                }
                loadSources()
            } catch (e: Exception) {
                _message.value = e.message ?: e.toString()
            } finally {
                _busy.value = false
            }
        }
    }

    fun refreshSource(sourceId: Long) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.refreshSource(sourceId)
                }
                loadSources()
            } catch (e: Exception) {
                _message.value = e.message ?: e.toString()
            } finally {
                _busy.value = false
            }
        }
    }

    fun updateSource(
        sourceId: Long,
        name: String,
        location: String,
        username: String?,
        password: String?,
        autoRefreshMinutes: UInt?,
        enabled: Boolean,
    ) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.updateSource(
                        sourceId = sourceId,
                        name = name,
                        location = location,
                        username = username,
                        password = password,
                        autoRefreshMinutes = autoRefreshMinutes,
                        enabled = enabled,
                    )
                }
                loadSources()
            } catch (e: Exception) {
                _message.value = e.message ?: e.toString()
            } finally {
                _busy.value = false
            }
        }
    }

    fun deleteSource(sourceId: Long) {
        viewModelScope.launch {
            _busy.value = true
            _message.value = null
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.deleteSource(sourceId)
                }
                loadSources()
            } catch (e: Exception) {
                _message.value = e.message ?: e.toString()
            } finally {
                _busy.value = false
            }
        }
    }

    fun clearMessage() {
        _message.value = null
    }
}
