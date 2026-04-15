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

data class FavoriteListItem(
    val channel: ChannelInfo,
    val nowTitle: String?,
)

@HiltViewModel
class FavoritesViewModel @Inject constructor() : ViewModel() {

    private val _favorites = MutableStateFlow<List<FavoriteListItem>>(emptyList())
    val favorites: StateFlow<List<FavoriteListItem>> = _favorites.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    init {
        loadFavorites()
    }

    fun loadFavorites() {
        viewModelScope.launch {
            _loading.value = true
            try {
                val list = withContext(Dispatchers.IO) {
                    Opentivi.listFavorites()
                }
                val snapshots = withContext(Dispatchers.IO) {
                    if (list.isEmpty()) {
                        emptyList()
                    } else {
                        val now = System.currentTimeMillis()
                        Opentivi.getChannelsEpgSnapshots(
                            channelIds = list.map { it.id },
                            windowStartTs = now - 15 * 60 * 1000,
                            windowEndTs = now + 4 * 60 * 60 * 1000,
                        )
                    }
                }
                val byId = snapshots.associateBy(ChannelEpgSnapshot::channelId)
                _favorites.value = list.map { ch ->
                    FavoriteListItem(ch, byId[ch.id]?.now?.title)
                }
            } catch (_: Exception) {
                _favorites.value = emptyList()
            } finally {
                _loading.value = false
            }
        }
    }

    fun removeFavorite(channelId: Long) {
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    Opentivi.setFavorite(channelId, false)
                }
                loadFavorites()
            } catch (_: Exception) {
            }
        }
    }
}
