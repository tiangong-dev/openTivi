package com.opentivi.tv.player

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer

class TiviPlayer(context: Context) {

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(context).build()

    @OptIn(UnstableApi::class)
    fun play(streamUrl: String, proxyPort: Int) {
        // Route through local Rust proxy for stream processing
        val proxyUrl = "http://127.0.0.1:$proxyPort/stream?url=$streamUrl"
        val mediaItem = MediaItem.fromUri(proxyUrl)
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    fun switchChannel(streamUrl: String) {
        // TODO: Get proxy port from Rust bridge
        val proxyPort = 0 // TODO: RustBridge.getProxyPort()
        val proxyUrl = "http://127.0.0.1:$proxyPort/stream?url=$streamUrl"
        val mediaItem = MediaItem.fromUri(proxyUrl)
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    fun release() {
        exoPlayer.release()
    }
}
