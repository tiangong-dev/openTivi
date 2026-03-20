package com.opentivi.tv.player

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer

class TiviPlayer(context: Context) {

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(context).build()

    fun play(streamUrl: String, proxyPort: Int) {
        val proxyUrl = "http://127.0.0.1:$proxyPort/stream?url=$streamUrl"
        val mediaItem = MediaItem.fromUri(proxyUrl)
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    fun switchChannel(streamUrl: String, proxyPort: Int) {
        play(streamUrl, proxyPort)
    }

    fun release() {
        exoPlayer.release()
    }
}
