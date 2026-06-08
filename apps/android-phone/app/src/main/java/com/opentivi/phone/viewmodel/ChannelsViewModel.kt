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
import uniffi.opentivi.ChannelEpgSnapshot
import uniffi.opentivi.ChannelInfo
import uniffi.opentivi.Opentivi
import javax.inject.Inject

private const val CHANNEL_PAGE_LIMIT = 5000u

data class ChannelListItem(
    val channel: ChannelInfo,
    val nowTitle: String?,
    val nextTitle: String?,
)

@HiltViewModel
class ChannelsViewModel @Inject constructor() : ViewModel() {

    private val _channels = MutableStateFlow<List<ChannelListItem>>(emptyList())
    val channels: StateFlow<List<ChannelListItem>> = _channels.asStateFlow()

    private val _groups = MutableStateFlow<List<String>>(emptyList())
    val groups: StateFlow<List<String>> = _groups.asStateFlow()

    private val _selectedGroup = MutableStateFlow<String?>(null)
    val selectedGroup: StateFlow<String?> = _selectedGroup.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        refreshAll()
    }

    fun refreshAll() {
        viewModelScope.launch {
            _refreshing.value = true
            _error.value = null
            try {
                val groupList = withContext(Dispatchers.IO) {
                    Opentivi.listGroups(null)
                }
                _groups.value = groupList
                loadChannels()
            } catch (e: Exception) {
                _error.value = e.message ?: e.toString()
            } finally {
                _refreshing.value = false
            }
        }
    }

    fun selectGroup(group: String?) {
        _selectedGroup.value = group
        loadChannels()
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
        loadChannels()
    }

    fun loadChannels() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            try {
                val group = _selectedGroup.value
                val q = _searchQuery.value.trim().ifEmpty { null }
                val list = withContext(Dispatchers.IO) {
                    Opentivi.listChannels(
                        sourceId = null,
                        groupName = group,
                        search = q,
                        favoritesOnly = false,
                        limit = CHANNEL_PAGE_LIMIT,
                        offset = 0u,
                    )
                }
                val snapshots = withContext(Dispatchers.IO) {
                    if (list.isEmpty()) {
                        emptyList()
                    } else {
                        val now = System.currentTimeMillis()
                        val windowStart = now - 15 * 60 * 1000
                        val windowEnd = now + 4 * 60 * 60 * 1000
                        Opentivi.getChannelsEpgSnapshots(
                            channelIds = list.map { it.id },
                            windowStartTs = windowStart,
                            windowEndTs = windowEnd,
                        )
                    }
                }
                val byId = snapshots.associateBy(ChannelEpgSnapshot::channelId)
                _channels.value = list.map { ch ->
                    val snap = byId[ch.id]
                    ChannelListItem(
                        channel = ch,
                        nowTitle = snap?.now?.title,
                        nextTitle = snap?.next?.title,
                    )
                }
            } catch (e: Exception) {
                _error.value = e.message ?: e.toString()
                _channels.value = emptyList()
            } finally {
                _loading.value = false
            }
        }
    }

    fun toggleFavorite(channelId: Long, favorite: Boolean) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.setFavorite(channelId, favorite)
                }
                loadChannels()
            } catch (_: Exception) {
            }
        }
    }
}
