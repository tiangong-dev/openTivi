import AVFoundation
import Foundation
import os.log
import UIKit
import VLCKitSPM

private let logger = Logger(subsystem: "com.opentivi.ios", category: "StreamPlayer")

/// VLC-backed player that can handle IPTV TS streams with MP2 audio.
final class StreamPlayer: NSObject, ObservableObject {
    @Published var isPlaying = false
    @Published var error: String?
    @Published var observedBitrateBps: Double = 0
    @Published var indicatedBitrateBps: Double = 0

    private let mediaPlayer: VLCMediaPlayer
    private weak var drawableView: UIView?
    private var lastLoggedSecond: Int = -1

    override init() {
        self.mediaPlayer = VLCMediaPlayer()
        super.init()

        logger.info("StreamPlayer initialized with VLC backend")

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
            logger.info("Audio session configured for playback")
        } catch {
            logger.error("Failed to configure audio session: \(error.localizedDescription)")
        }

        mediaPlayer.delegate = self
    }

    func attachDrawable(_ view: UIView) {
        guard drawableView !== view else {
            // Same view but VLC may have lost track — re-assign to be safe
            if mediaPlayer.drawable as AnyObject !== view {
                mediaPlayer.drawable = view
            }
            return
        }
        drawableView = view
        mediaPlayer.drawable = view
        logger.debug("Drawable attached: \(ObjectIdentifier(view))")
    }

    func detachDrawable(_ view: UIView) {
        guard drawableView === view else { return }
        // Do NOT nil-out mediaPlayer.drawable here — the player may still
        // be active and a new surface will be attached shortly.  Clearing it
        // causes the audio-only black-screen bug on re-entry.
        drawableView = nil
        logger.debug("Drawable reference cleared (VLC drawable kept)")
    }

    func play(streamUrl: String) {
        logger.info("Playing stream with VLC: \(streamUrl)")
        guard let url = URL(string: streamUrl) else {
            logger.error("Invalid stream URL: \(streamUrl)")
            error = "Invalid stream URL"
            return
        }

        let media = VLCMedia(url: url)
        media.addOption(":network-caching=1000")
        media.addOption(":clock-jitter=0")
        media.addOption(":clock-synchro=0")

        error = nil
        observedBitrateBps = 0
        indicatedBitrateBps = 0
        lastLoggedSecond = -1

        mediaPlayer.stop()
        mediaPlayer.media = media

        // Re-attach drawable in case the view was recreated (avoids black screen)
        if let view = drawableView {
            mediaPlayer.drawable = view
        }

        mediaPlayer.play()
        logger.info("Called mediaPlayer.play()")

        let session = AVAudioSession.sharedInstance()
        logger.info(
            "AudioSession — category=\(session.category.rawValue), mode=\(session.mode.rawValue), outputVolume=\(session.outputVolume), outputRoutes=\(session.currentRoute.outputs.map { "\($0.portType.rawValue):\($0.portName)" })"
        )
    }

    func stop() {
        logger.info("Stopping playback")
        mediaPlayer.stop()
        mediaPlayer.drawable = nil
        mediaPlayer.media = nil
        drawableView = nil
        error = nil
        isPlaying = false
        observedBitrateBps = 0
        indicatedBitrateBps = 0
        lastLoggedSecond = -1
    }
}

extension StreamPlayer: VLCMediaPlayerDelegate {
    func mediaPlayerStateChanged(_ aNotification: Notification) {
        let state = mediaPlayer.state
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            switch state {
            case .opening:
                logger.debug("VLC state: opening")
            case .buffering:
                logger.debug("VLC state: buffering")
            case .playing:
                logger.info("VLC state: playing")
                self.isPlaying = true
            case .paused:
                logger.info("VLC state: paused")
                self.isPlaying = false
            case .stopped:
                logger.info("VLC state: stopped")
                self.isPlaying = false
            case .ended:
                logger.info("VLC state: ended")
                self.isPlaying = false
            case .error:
                logger.error("VLC state: error")
                self.error = "VLC playback error"
                self.isPlaying = false
            default:
                logger.debug("VLC state changed: \(VLCMediaPlayerStateToString(state))")
            }
        }
    }

    func mediaPlayerTimeChanged(_ aNotification: Notification) {
        let currentMs = Int(mediaPlayer.time.intValue)
        let position = mediaPlayer.position
        let remainingMs = Int(mediaPlayer.remainingTime?.intValue ?? 0)
        let second = currentMs / 1000
        guard second != lastLoggedSecond else { return }

        lastLoggedSecond = second
        logger.debug("VLC time: \(currentMs)ms remaining=\(remainingMs)ms position=\(String(format: "%.3f", position))")

        guard let media = mediaPlayer.media else { return }
        let stats = media.statistics
        let inputBitrate = Double(stats.inputBitrate) * 1000
        let demuxBitrate = Double(stats.demuxBitrate) * 1000
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if inputBitrate > 0 {
                self.observedBitrateBps = inputBitrate
            }
            if demuxBitrate > 0 {
                self.indicatedBitrateBps = demuxBitrate
            }
        }
    }
}
