package com.opentivi.tv.viewmodel

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class FavoritesViewModel @Inject constructor() : ViewModel() {

    // TODO: Define Channel data class from Rust bridge types
    private val _favorites = MutableStateFlow<List<Any>>(emptyList())
    val favorites: StateFlow<List<Any>> = _favorites.asStateFlow()

    init {
        loadFavorites()
    }

    fun loadFavorites() {
        // TODO: Call Rust bridge to load favorite channels
        // val favorites = RustBridge.getFavoriteChannels()
        // _favorites.value = favorites
    }

    fun removeFavorite(channelId: Long) {
        // TODO: Call Rust bridge to remove favorite
        // RustBridge.removeFavorite(channelId)
        // loadFavorites()
    }
}
