package com.opentivi.phone.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import com.opentivi.phone.OpenTiviEngine
import com.opentivi.phone.player.TiviPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.opentivi.ChannelEpgSnapshot
import uniffi.opentivi.ChannelInfo
import uniffi.opentivi.Opentivi
import uniffi.opentivi.PlaybackInfo
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel @Inject constructor(
    application: Application,
) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "PlayerViewModel"
        private const val STALL_COUNT_THRESHOLD = 3
        private const val STALL_WINDOW_MS = 60_000L
        private const val SWITCH_COOLDOWN_MS = 30_000L
        private const val MAX_AUTO_RETRIES = 2
    }

    private val tiviPlayer = TiviPlayer(application)

    val exoPlayer get() = tiviPlayer.exoPlayer

    private val _channelName = MutableStateFlow("")
    val channelName: StateFlow<String> = _channelName.asStateFlow()

    private val _channelLogo = MutableStateFlow<String?>(null)
    val channelLogo: StateFlow<String?> = _channelLogo.asStateFlow()

    private val _channelGroup = MutableStateFlow<String?>(null)
    val channelGroup: StateFlow<String?> = _channelGroup.asStateFlow()

    private val _currentProgram = MutableStateFlow<String?>(null)
    val currentProgram: StateFlow<String?> = _currentProgram.asStateFlow()

    private val _nextProgram = MutableStateFlow<String?>(null)
    val nextProgram: StateFlow<String?> = _nextProgram.asStateFlow()

    private val _epgSnapshot = MutableStateFlow<ChannelEpgSnapshot?>(null)
    val epgSnapshot: StateFlow<ChannelEpgSnapshot?> = _epgSnapshot.asStateFlow()

    private val _orderedChannels = MutableStateFlow<List<ChannelInfo>>(emptyList())
    val orderedChannels: StateFlow<List<ChannelInfo>> = _orderedChannels.asStateFlow()
    private val _currentIndex = MutableStateFlow(0)
    val currentIndex: StateFlow<Int> = _currentIndex.asStateFlow()

    // Multi-source state
    private var candidates: List<PlaybackInfo> = emptyList()
    private var candidateIndex = 0
    private var lastSwitchTime = 0L
    private var bufferWatchJob: Job? = null

    // Diagnostics state
    private val _playbackState = MutableStateFlow("IDLE")
    val playbackState: StateFlow<String> = _playbackState.asStateFlow()

    private val _videoResolution = MutableStateFlow("")
    val videoResolution: StateFlow<String> = _videoResolution.asStateFlow()

    private val _videoCodec = MutableStateFlow<String?>(null)
    val videoCodec: StateFlow<String?> = _videoCodec.asStateFlow()

    private val _audioCodec = MutableStateFlow<String?>(null)
    val audioCodec: StateFlow<String?> = _audioCodec.asStateFlow()

    private val _currentStreamUrl = MutableStateFlow("")
    val currentStreamUrl: StateFlow<String> = _currentStreamUrl.asStateFlow()

    private val _candidateCount = MutableStateFlow(0)
    val candidateCount: StateFlow<Int> = _candidateCount.asStateFlow()

    private val _currentCandidateIndex = MutableStateFlow(0)
    val currentCandidateIndex: StateFlow<Int> = _currentCandidateIndex.asStateFlow()

    // Favorite state
    private val _isFavorite = MutableStateFlow(false)
    val isFavorite: StateFlow<Boolean> = _isFavorite.asStateFlow()

    // Error & retry state
    private val _playbackError = MutableStateFlow<String?>(null)
    val playbackError: StateFlow<String?> = _playbackError.asStateFlow()

    private val _retryCount = MutableStateFlow(0)
    val retryCount: StateFlow<Int> = _retryCount.asStateFlow()

    // Network speed
    private val _networkSpeed = MutableStateFlow("")
    val networkSpeed: StateFlow<String> = _networkSpeed.asStateFlow()
    private var speedWatchJob: Job? = null

    var currentChannelId: Long? = null
        private set

    // Touch lock state
    var isLocked by mutableStateOf(false)

    // Landscape state
    var isLandscape by mutableStateOf(false)

    private fun startSpeedWatch() {
        speedWatchJob?.cancel()
        speedWatchJob = viewModelScope.launch {
            var prevBytes = android.net.TrafficStats.getUidRxBytes(android.os.Process.myUid())
            while (true) {
                delay(1_000)
                val now = android.net.TrafficStats.getUidRxBytes(android.os.Process.myUid())
                val bytesPerSec = (now - prevBytes).coerceAtLeast(0)
                prevBytes = now
                _networkSpeed.value = when {
                    bytesPerSec >= 1_048_576 -> "%.1f MB/s".format(bytesPerSec / 1_048_576.0)
                    bytesPerSec >= 1_024 -> "%.0f KB/s".format(bytesPerSec / 1_024.0)
                    else -> "%d B/s".format(bytesPerSec)
                }
            }
        }
    }

    init {
        startSpeedWatch()
        exoPlayer.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                _playbackState.value = when (playbackState) {
                    Player.STATE_IDLE -> "IDLE"
                    Player.STATE_BUFFERING -> "BUFFERING"
                    Player.STATE_READY -> "READY"
                    Player.STATE_ENDED -> "ENDED"
                    else -> "UNKNOWN"
                }
                if (playbackState == Player.STATE_READY) {
                    _playbackError.value = null
                }
            }

            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    _videoResolution.value = "${videoSize.width}x${videoSize.height}"
                }
            }

            override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                for (group in tracks.groups) {
                    for (i in 0 until group.length) {
                        if (group.isTrackSelected(i)) {
                            val format = group.getTrackFormat(i)
                            val mime = format.sampleMimeType ?: continue
                            if (mime.startsWith("video/")) {
                                _videoCodec.value = mime.removePrefix("video/")
                            } else if (mime.startsWith("audio/")) {
                                _audioCodec.value = mime.removePrefix("audio/")
                            }
                        }
                    }
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                val msg = error.message ?: "Unknown error (code=${error.errorCode})"
                Log.e(TAG, "playerError: $msg")
                _playbackError.value = msg
                handlePlaybackError()
            }
        })
    }

    fun loadChannel(channelId: Long) {
        Log.i(TAG, "loadChannel: channelId=$channelId")
        currentChannelId = channelId
        _retryCount.value = 0
        _playbackError.value = null
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    runCatching { Opentivi.markRecentWatched(channelId) }
                }

                candidates = withContext(Dispatchers.IO) {
                    Opentivi.listPlaybackCandidates(channelId)
                }
                candidateIndex = 0
                _candidateCount.value = candidates.size
                _currentCandidateIndex.value = 0

                val playback = candidates.firstOrNull()
                    ?: withContext(Dispatchers.IO) { Opentivi.resolvePlayback(channelId) }

                _currentStreamUrl.value = playback.streamUrl
                val all = withContext(Dispatchers.IO) {
                    Opentivi.listChannels(
                        sourceId = null, groupName = null, search = null,
                        favoritesOnly = false, limit = 5000u, offset = 0u,
                    )
                }
                val idx = all.indexOfFirst { it.id == channelId }.coerceAtLeast(0)
                _orderedChannels.value = all
                _currentIndex.value = idx
                val channelInfo = all.firstOrNull { it.id == channelId }
                _channelName.value = playback.channelName
                _channelLogo.value = playback.logoUrl
                _channelGroup.value = channelInfo?.groupName
                _isFavorite.value = channelInfo?.isFavorite == true
                refreshEpg(channelId)
                withContext(Dispatchers.Main) {
                    tiviPlayer.play(playback.streamUrl, OpenTiviEngine.proxyPort)
                }
                startBufferWatch()
            } catch (e: Exception) {
                Log.e(TAG, "loadChannel: failed", e)
                _channelName.value = ""
                _channelLogo.value = null
                _channelGroup.value = null
                _currentProgram.value = null
                _nextProgram.value = null
                _isFavorite.value = false
                _playbackError.value = e.message
            }
        }
    }

    // Error auto-retry: try all candidates before giving up
    private fun handlePlaybackError() {
        val retries = _retryCount.value
        val maxRetries = if (candidates.size > 1) candidates.size - 1 else MAX_AUTO_RETRIES
        if (retries < maxRetries) {
            _retryCount.value = retries + 1
            if (candidates.size > 1) {
                candidateIndex = (candidateIndex + 1) % candidates.size
                val next = candidates[candidateIndex]
                _currentCandidateIndex.value = candidateIndex
                _currentStreamUrl.value = next.streamUrl
                Log.i(TAG, "autoRetry: switching to candidate ${candidateIndex + 1}/${candidates.size}")
                tiviPlayer.play(next.streamUrl, OpenTiviEngine.proxyPort)
            } else {
                Log.i(TAG, "autoRetry: retrying same source (attempt ${retries + 1})")
                viewModelScope.launch {
                    delay(1000)
                    exoPlayer.seekToDefaultPosition()
                    exoPlayer.prepare()
                }
            }
        }
    }

    fun manualRetry() {
        _retryCount.value = 0
        _playbackError.value = null
        val id = currentChannelId
        if (id != null && id > 0) {
            loadChannel(id)
        }
    }

    /** Manual source switch: cycle to the next candidate */
    fun switchSource() {
        if (candidates.size <= 1) return
        candidateIndex = (candidateIndex + 1) % candidates.size
        val next = candidates[candidateIndex]
        _currentCandidateIndex.value = candidateIndex
        _currentStreamUrl.value = next.streamUrl
        _retryCount.value = 0
        _playbackError.value = null
        Log.i(TAG, "manualSwitch: switching to candidate ${candidateIndex + 1}/${candidates.size}")
        tiviPlayer.play(next.streamUrl, OpenTiviEngine.proxyPort)
        startBufferWatch()
    }

    // Buffer stall detection + auto-switch
    private val stallTimestamps = mutableListOf<Long>()

    private fun startBufferWatch() {
        bufferWatchJob?.cancel()
        stallTimestamps.clear()
        bufferWatchJob = viewModelScope.launch {
            var wasBuffering = false
            while (true) {
                delay(1_000)
                val isBuffering = exoPlayer.playbackState == Player.STATE_BUFFERING
                if (isBuffering && !wasBuffering) {
                    val now = System.currentTimeMillis()
                    stallTimestamps.add(now)
                    stallTimestamps.removeAll { now - it > STALL_WINDOW_MS }
                    if (stallTimestamps.size >= STALL_COUNT_THRESHOLD) {
                        tryNextCandidate()
                        stallTimestamps.clear()
                    }
                }
                wasBuffering = isBuffering
            }
        }
    }

    private fun tryNextCandidate() {
        val now = System.currentTimeMillis()
        if (now - lastSwitchTime < SWITCH_COOLDOWN_MS) return
        if (candidates.size <= 1) return

        candidateIndex = (candidateIndex + 1) % candidates.size
        val next = candidates[candidateIndex]
        Log.i(TAG, "autoSwitch: switching to candidate ${candidateIndex + 1}/${candidates.size}")
        lastSwitchTime = now
        _currentCandidateIndex.value = candidateIndex
        _currentStreamUrl.value = next.streamUrl
        tiviPlayer.play(next.streamUrl, OpenTiviEngine.proxyPort)
    }

    // EPG
    private suspend fun refreshEpg(channelId: Long) {
        val snaps = withContext(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            Opentivi.getChannelsEpgSnapshots(
                channelIds = listOf(channelId),
                windowStartTs = now - 15 * 60 * 1000,
                windowEndTs = now + 4 * 60 * 60 * 1000,
            )
        }
        val snap: ChannelEpgSnapshot? = snaps.firstOrNull()
        _epgSnapshot.value = snap
        _currentProgram.value = snap?.now?.title
        _nextProgram.value = snap?.next?.title
    }

    // Channel navigation
    fun switchToPreviousChannel() {
        val list = _orderedChannels.value
        val idx = _currentIndex.value
        if (idx <= 0) return
        val prev = list[idx - 1]
        _currentIndex.value = idx - 1
        currentChannelId = prev.id
        switchToChannel(prev.id)
    }

    fun switchToNextChannel() {
        val list = _orderedChannels.value
        val idx = _currentIndex.value
        if (idx + 1 >= list.size) return
        val next = list[idx + 1]
        _currentIndex.value = idx + 1
        currentChannelId = next.id
        switchToChannel(next.id)
    }

    fun switchToChannel(channelId: Long) {
        Log.i(TAG, "switchToChannel: channelId=$channelId")
        currentChannelId = channelId
        _retryCount.value = 0
        _playbackError.value = null
        // Update index in ordered list
        val idx = _orderedChannels.value.indexOfFirst { it.id == channelId }
        if (idx >= 0) _currentIndex.value = idx
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    runCatching { Opentivi.markRecentWatched(channelId) }
                }
                candidates = withContext(Dispatchers.IO) {
                    Opentivi.listPlaybackCandidates(channelId)
                }
                candidateIndex = 0
                _candidateCount.value = candidates.size
                _currentCandidateIndex.value = 0

                val playback = candidates.firstOrNull()
                    ?: withContext(Dispatchers.IO) { Opentivi.resolvePlayback(channelId) }

                val channelInfo = _orderedChannels.value.firstOrNull { it.id == channelId }
                _channelName.value = playback.channelName
                _channelLogo.value = playback.logoUrl
                _channelGroup.value = channelInfo?.groupName
                _currentStreamUrl.value = playback.streamUrl
                _isFavorite.value = channelInfo?.isFavorite == true
                refreshEpg(channelId)
                withContext(Dispatchers.Main) {
                    tiviPlayer.play(playback.streamUrl, OpenTiviEngine.proxyPort)
                }
                startBufferWatch()
            } catch (e: Exception) {
                Log.e(TAG, "switchToChannel: failed", e)
                _playbackError.value = e.message
            }
        }
    }

    fun toggleFavorite() {
        val id = currentChannelId ?: return
        val newValue = !_isFavorite.value
        _isFavorite.value = newValue
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                runCatching { Opentivi.setFavorite(id, newValue) }
            }
        }
    }

    fun togglePlayPause() {
        if (tiviPlayer.isPlaying) {
            tiviPlayer.pause()
        } else {
            tiviPlayer.resume()
        }
    }

    override fun onCleared() {
        super.onCleared()
        bufferWatchJob?.cancel()
        speedWatchJob?.cancel()
        tiviPlayer.release()
    }
}
