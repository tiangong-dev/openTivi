package com.opentivi.tv.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.opentivi.tv.player.TiviPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel @Inject constructor(
    application: Application,
) : AndroidViewModel(application) {

    private val tiviPlayer = TiviPlayer(application)

    val exoPlayer get() = tiviPlayer.exoPlayer

    private val _channelName = MutableStateFlow("")
    val channelName: StateFlow<String> = _channelName.asStateFlow()

    private val _currentProgram = MutableStateFlow<String?>(null)
    val currentProgram: StateFlow<String?> = _currentProgram.asStateFlow()

    private val _nextProgram = MutableStateFlow<String?>(null)
    val nextProgram: StateFlow<String?> = _nextProgram.asStateFlow()

    fun loadChannel(channelId: Long) {
        // TODO: Call Rust bridge to get channel info and stream URL
    }

    fun switchToPreviousChannel() {
        // TODO: Call Rust bridge to get previous channel and switch
    }

    fun switchToNextChannel() {
        // TODO: Call Rust bridge to get next channel and switch
    }

    override fun onCleared() {
        super.onCleared()
        tiviPlayer.release()
    }
}
