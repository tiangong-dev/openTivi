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
import uniffi.opentivi.ChannelEpgSnapshot
import uniffi.opentivi.ChannelInfo
import uniffi.opentivi.Opentivi
import javax.inject.Inject

private const val CHANNEL_PAGE_LIMIT = 5000u

data class ChannelGridItem(
    val channel: ChannelInfo,
    val nowTitle: String?,
)

enum class ChannelSortOrder { NAME, NUMBER, SOURCE }

@HiltViewModel
class ChannelsViewModel @Inject constructor() : ViewModel() {

    private val _channels = MutableStateFlow<List<ChannelGridItem>>(emptyList())
    val channels: StateFlow<List<ChannelGridItem>> = _channels.asStateFlow()

    private val _groups = MutableStateFlow<List<String>>(emptyList())
    val groups: StateFlow<List<String>> = _groups.asStateFlow()

    private val _selectedGroup = MutableStateFlow<String?>(null)
    val selectedGroup: StateFlow<String?> = _selectedGroup.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _sortOrder = MutableStateFlow(ChannelSortOrder.NAME)
    val sortOrder: StateFlow<ChannelSortOrder> = _sortOrder.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        refreshAll()
    }

    fun refreshAll() {
        viewModelScope.launch {
            _loading.value = true
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
                _loading.value = false
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

    fun setSortOrder(order: ChannelSortOrder) {
        _sortOrder.value = order
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
                val items = list.map { ch ->
                    val snap = byId[ch.id]
                    val nowTitle = snap?.now?.title
                    ChannelGridItem(channel = ch, nowTitle = nowTitle)
                }
                _channels.value = sortItems(items)
            } catch (e: Exception) {
                _error.value = e.message ?: e.toString()
                _channels.value = emptyList()
            } finally {
                _loading.value = false
            }
        }
    }

    private fun sortItems(items: List<ChannelGridItem>): List<ChannelGridItem> {
        return when (_sortOrder.value) {
            ChannelSortOrder.NAME -> items.sortedBy { it.channel.name.lowercase() }
            ChannelSortOrder.NUMBER -> items.sortedWith(
                compareBy(nullsLast()) { it.channel.channelNumber?.toIntOrNull() }
            )
            ChannelSortOrder.SOURCE -> items.sortedWith(
                compareBy<ChannelGridItem> { it.channel.sourceId }
                    .thenBy(nullsLast()) { it.channel.channelNumber?.toIntOrNull() }
            )
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
