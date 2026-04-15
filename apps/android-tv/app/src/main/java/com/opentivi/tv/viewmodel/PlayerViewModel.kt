package com.opentivi.tv.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.opentivi.tv.player.TiviPlayer
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
import android.util.Log
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.VideoSize
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel @Inject constructor(
    application: Application,
) : AndroidViewModel(application) {

    companion object {
        private const val TAG = "PlayerViewModel"
        /** If this many stalls occur within the window, switch source. */
        private const val STALL_COUNT_THRESHOLD = 3
        /** Rolling window for counting stalls. */
        private const val STALL_WINDOW_MS = 60_000L
        /** Min interval between source switches to avoid rapid cycling. */
        private const val SWITCH_COOLDOWN_MS = 10_000L
        /** Max auto-retries on playback error. */
        private const val MAX_AUTO_RETRIES = 2
        /** If playback doesn't reach READY within this time, switch source. */
        private const val INITIAL_BUFFER_TIMEOUT_MS = 8_000L
    }

    private val tiviPlayer = TiviPlayer(application)

    val exoPlayer get() = tiviPlayer.exoPlayer

    private val _channelName = MutableStateFlow("")
    val channelName: StateFlow<String> = _channelName.asStateFlow()

    private val _currentProgram = MutableStateFlow<String?>(null)
    val currentProgram: StateFlow<String?> = _currentProgram.asStateFlow()

    private val _nextProgram = MutableStateFlow<String?>(null)
    val nextProgram: StateFlow<String?> = _nextProgram.asStateFlow()

    private val _orderedChannels = MutableStateFlow<List<ChannelInfo>>(emptyList())
    val orderedChannels: StateFlow<List<ChannelInfo>> = _orderedChannels.asStateFlow()
    private val _currentIndex = MutableStateFlow(0)

    // ── Multi-source state ──────────────────────────────────────────────

    /** All playback candidates for the current channel, sorted by quality. */
    private var candidates: List<PlaybackInfo> = emptyList()
    /** Index into candidates — which source we're currently playing. */
    private var candidateIndex = 0
    /** Timestamp of last auto-switch to prevent rapid cycling. */
    private var lastSwitchTime = 0L
    /** Job that monitors buffering and triggers auto-switch. */
    private var bufferWatchJob: Job? = null

    // ── Diagnostics state ───────────────────────────────────────────────

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

    // ── Error & retry state ─────────────────────────────────────────────

    private val _playbackError = MutableStateFlow<String?>(null)
    val playbackError: StateFlow<String?> = _playbackError.asStateFlow()

    private val _retryCount = MutableStateFlow(0)
    val retryCount: StateFlow<Int> = _retryCount.asStateFlow()

    // ── Favorite state ─────────────────────────────────────────────────

    private val _isFavorite = MutableStateFlow(false)
    val isFavorite: StateFlow<Boolean> = _isFavorite.asStateFlow()

    private var currentChannelId: Long = 0L

    init {
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

                // Fetch all candidates sorted by health/speed
                candidates = withContext(Dispatchers.IO) {
                    Opentivi.listPlaybackCandidates(channelId)
                }
                candidateIndex = 0
                _candidateCount.value = candidates.size
                _currentCandidateIndex.value = 0
                Log.i(TAG, "loadChannel: ${candidates.size} candidates for channelId=$channelId")

                val playback = candidates.firstOrNull()
                    ?: withContext(Dispatchers.IO) { Opentivi.resolvePlayback(channelId) }

                Log.i(TAG, "loadChannel: playing source_id=${playback.sourceId} url=${playback.streamUrl}")
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
                _isFavorite.value = channelInfo?.isFavorite == true
                refreshEpg(channelId)

                withContext(Dispatchers.Main) {
                    tiviPlayer.play(playback.streamUrl)
                }
                startBufferWatch()
            } catch (e: Exception) {
                Log.e(TAG, "loadChannel: failed", e)
                _channelName.value = ""
                _currentProgram.value = null
                _nextProgram.value = null
                _isFavorite.value = false
            }
        }
    }

    // ── Error auto-retry ────────────────────────────────────────────────

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
                tiviPlayer.play(next.streamUrl)
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
        if (currentChannelId > 0) {
            loadChannel(currentChannelId)
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
        tiviPlayer.play(next.streamUrl)
        startBufferWatch()
    }

    // ── Buffer stall detection + auto-switch ────────────────────────────

    /** Timestamps of recent buffering events for stall frequency detection. */
    private val stallTimestamps = mutableListOf<Long>()

    private fun startBufferWatch() {
        bufferWatchJob?.cancel()
        stallTimestamps.clear()
        bufferWatchJob = viewModelScope.launch {
            val startTime = System.currentTimeMillis()
            var wasBuffering = false
            var everReady = false
            while (true) {
                delay(1_000)
                val state = exoPlayer.playbackState
                val isBuffering = state == Player.STATE_BUFFERING
                if (state == Player.STATE_READY) everReady = true

                // Initial buffering timeout: if never reached READY, switch source
                if (!everReady && isBuffering) {
                    val elapsed = System.currentTimeMillis() - startTime
                    if (elapsed >= INITIAL_BUFFER_TIMEOUT_MS) {
                        Log.w(TAG, "bufferWatch: initial buffer timeout (${elapsed}ms) — switching source")
                        if (tryNextCandidate()) {
                            break // restart watch in tryNextCandidate via new startBufferWatch
                        }
                    }
                }

                // Record each new buffering→ event (not continuous polling)
                if (isBuffering && !wasBuffering) {
                    val now = System.currentTimeMillis()
                    stallTimestamps.add(now)
                    // Prune old entries outside the window
                    stallTimestamps.removeAll { now - it > STALL_WINDOW_MS }
                    Log.i(TAG, "bufferWatch: stall #${stallTimestamps.size} in last ${STALL_WINDOW_MS / 1000}s")
                    if (stallTimestamps.size >= STALL_COUNT_THRESHOLD) {
                        tryNextCandidate()
                        stallTimestamps.clear()
                    }
                }
                wasBuffering = isBuffering
            }
        }
    }

    private fun tryNextCandidate(): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastSwitchTime < SWITCH_COOLDOWN_MS) return false
        if (candidates.size <= 1) return false

        candidateIndex = (candidateIndex + 1) % candidates.size
        val next = candidates[candidateIndex]
        Log.i(TAG, "autoSwitch: stall detected → switching to source_id=${next.sourceId} (candidate ${candidateIndex + 1}/${candidates.size})")
        lastSwitchTime = now
        _currentCandidateIndex.value = candidateIndex
        _currentStreamUrl.value = next.streamUrl
        _retryCount.value = _retryCount.value + 1

        tiviPlayer.play(next.streamUrl)
        startBufferWatch()
        return true
    }

    // ── EPG ─────────────────────────────────────────────────────────────

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
        _currentProgram.value = snap?.now?.title
        _nextProgram.value = snap?.next?.title
    }

    // ── Channel navigation ──────────────────────────────────────────────

    fun switchToPreviousChannel() {
        val list = _orderedChannels.value
        val idx = _currentIndex.value
        if (idx <= 0) return
        val prev = list[idx - 1]
        _currentIndex.value = idx - 1
        switchToChannel(prev.id)
    }

    fun switchToNextChannel() {
        val list = _orderedChannels.value
        val idx = _currentIndex.value
        if (idx + 1 >= list.size) return
        val next = list[idx + 1]
        _currentIndex.value = idx + 1
        switchToChannel(next.id)
    }

    fun switchToChannel(channelId: Long) {
        Log.i(TAG, "switchToChannel: channelId=$channelId")
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

                Log.i(TAG, "switchToChannel: playing source_id=${playback.sourceId} url=${playback.streamUrl}")
                val channelInfo = _orderedChannels.value.firstOrNull { it.id == channelId }
                _channelName.value = playback.channelName
                _currentStreamUrl.value = playback.streamUrl
                _isFavorite.value = channelInfo?.isFavorite == true
                refreshEpg(channelId)
                withContext(Dispatchers.Main) {
                    tiviPlayer.play(playback.streamUrl)
                }
                startBufferWatch()
            } catch (e: Exception) {
                Log.e(TAG, "switchToChannel: failed", e)
            }
        }
    }

    fun toggleFavorite() {
        if (currentChannelId <= 0L) return
        val newValue = !_isFavorite.value
        _isFavorite.value = newValue
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                runCatching { Opentivi.setFavorite(currentChannelId, newValue) }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        bufferWatchJob?.cancel()
        tiviPlayer.release()
    }
}
