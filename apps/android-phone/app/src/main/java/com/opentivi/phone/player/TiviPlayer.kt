package com.opentivi.phone.player

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsDataSourceFactory
import androidx.media3.exoplayer.hls.HlsMediaSource

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class TiviPlayer(context: Context) {

    companion object {
        private const val TAG = "TiviPlayer"
    }

    private val httpDataSourceFactory = androidx.media3.datasource.DefaultHttpDataSource.Factory()
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(30_000)
        .setAllowCrossProtocolRedirects(true)

    private val dataSourceFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)

    private val hlsDataSourceFactory = HlsDataSourceFactory { _ ->
        dataSourceFactory.createDataSource()
    }

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(
        context,
        DefaultRenderersFactory(context)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON),
    ).setLoadControl(
        DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 50_000,
                /* maxBufferMs = */ 120_000,
                /* bufferForPlaybackMs = */ 1_500,
                /* bufferForPlaybackAfterRebufferMs = */ 3_000,
            )
            .build(),
    ).build().also { player ->
        player.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            /* handleAudioFocus = */ true,
        )
    }

    fun play(streamUrl: String, proxyPort: Int) {
        val encoded = Uri.encode(streamUrl, null)
        val proxyUrl = "http://127.0.0.1:$proxyPort/stream?url=$encoded"
        Log.i(TAG, "play: streamUrl=$streamUrl proxyUrl=$proxyUrl")

        val mimeType = when {
            streamUrl.contains(".m3u8", ignoreCase = true) -> MimeTypes.APPLICATION_M3U8
            streamUrl.contains(".mpd", ignoreCase = true) -> MimeTypes.APPLICATION_MPD
            else -> null
        }

        val mediaItem = MediaItem.Builder()
            .setUri(proxyUrl)
            .apply { if (mimeType != null) setMimeType(mimeType) }
            .setLiveConfiguration(
                MediaItem.LiveConfiguration.Builder()
                    .setTargetOffsetMs(30_000)
                    .setMaxOffsetMs(180_000)
                    .setMinPlaybackSpeed(1.0f)
                    .setMaxPlaybackSpeed(1.0f)
                    .build(),
            )
            .build()

        if (mimeType == MimeTypes.APPLICATION_M3U8) {
            val hlsSource = HlsMediaSource.Factory(hlsDataSourceFactory)
                .setAllowChunklessPreparation(true)
                .createMediaSource(mediaItem)
            exoPlayer.setMediaSource(hlsSource)
        } else {
            exoPlayer.setMediaItem(mediaItem)
        }
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    fun pause() {
        exoPlayer.playWhenReady = false
    }

    fun resume() {
        exoPlayer.playWhenReady = true
    }

    val isPlaying: Boolean get() = exoPlayer.isPlaying

    fun release() {
        Log.i(TAG, "release")
        exoPlayer.release()
    }
}
