package com.opentivi.tv.player

import android.content.Context
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
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

    /** No disk cache for live streams — segments play once so caching just adds I/O overhead. */
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
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                val stateName = when (playbackState) {
                    Player.STATE_IDLE -> "IDLE"
                    Player.STATE_BUFFERING -> "BUFFERING"
                    Player.STATE_READY -> "READY"
                    Player.STATE_ENDED -> "ENDED"
                    else -> "UNKNOWN($playbackState)"
                }
                Log.i(TAG, "playbackState=$stateName")
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e(TAG, "playerError: code=${error.errorCode} msg=${error.message}", error)
                // Don't auto-recover here — let PlayerViewModel handle error + source switching.
            }

            override fun onVideoSizeChanged(videoSize: VideoSize) {
                Log.i(TAG, "videoSize=${videoSize.width}x${videoSize.height}")
            }

            override fun onRenderedFirstFrame() {
                Log.i(TAG, "renderedFirstFrame")
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                Log.i(TAG, "isPlaying=$isPlaying")
            }

            override fun onTracksChanged(tracks: androidx.media3.common.Tracks) {
                for (group in tracks.groups) {
                    for (i in 0 until group.length) {
                        val format = group.getTrackFormat(i)
                        Log.i(TAG, "track: type=${format.sampleMimeType} selected=${group.isTrackSelected(i)} supported=${group.isTrackSupported(i)}")
                    }
                }
            }
        })
    }

    fun play(streamUrl: String) {
        Log.i(TAG, "play: streamUrl=$streamUrl")
        val mimeType = when {
            streamUrl.contains(".m3u8", ignoreCase = true) -> MimeTypes.APPLICATION_M3U8
            streamUrl.contains(".mpd", ignoreCase = true) -> MimeTypes.APPLICATION_MPD
            else -> null
        }
        val mediaItem = MediaItem.Builder()
            .setUri(streamUrl)
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
        Log.i(TAG, "play: mimeType=$mimeType")

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

    fun switchChannel(streamUrl: String) {
        play(streamUrl)
    }

    fun release() {
        Log.i(TAG, "release")
        exoPlayer.release()
    }

}
