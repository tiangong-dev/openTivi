import AVFoundation
import CoreGraphics
import Foundation
import os.log
import UIKit
import VLCKitSPM

private let logger = Logger(subsystem: "com.opentivi.ios", category: "VLCPlayerBackend")

/// VLCKit-backed playback engine. Handles IPTV TS streams with MP2 audio that
/// AVPlayer cannot decode. Used both as the primary backend for `mpegts`/`ts`
/// streams and as the fallback when AVPlayer hits a fatal error.
final class VLCPlayerBackend: NSObject, VideoPlayerBackend, VLCMediaPlayerDelegate {
    let kind: PlayerBackendKind = .vlc

    var onBufferingStarted: (() -> Void)?
    var onPlaybackResumed: (() -> Void)?
    var onFatalError: ((String) -> Void)?

    private(set) var isPlaying = false
    private(set) var observedBitrateBps: Double = 0
    private(set) var indicatedBitrateBps: Double = 0

    private let mediaPlayer: VLCMediaPlayer
    private weak var drawableView: UIView?
    private var lastLoggedSecond: Int = -1

    override init() {
        self.mediaPlayer = VLCMediaPlayer()
        super.init()
        logger.info("VLCPlayerBackend initialized")
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
        logger.debug("Drawable attached: \(String(describing: ObjectIdentifier(view)))")
    }

    func detachDrawable(_ view: UIView) {
        guard drawableView === view else { return }
        // Do NOT nil-out mediaPlayer.drawable here — the player may still
        // be active and a new surface will be attached shortly.  Clearing it
        // causes the audio-only black-screen bug on re-entry.
        drawableView = nil
        logger.debug("Drawable reference cleared (VLC drawable kept)")
    }

    func play(url: URL, headers: [String: String]) {
        logger.info("Playing stream with VLC: \(url.absoluteString)")

        let media = VLCMedia(url: url)
        media.addOption(":network-caching=1000")
        media.addOption(":clock-jitter=0")
        media.addOption(":clock-synchro=0")

        // Translate HTTP headers into VLC options.
        if let ua = headers["User-Agent"], !ua.isEmpty {
            media.addOption(":http-user-agent=\(ua)")
        }
        if let ref = headers["Referer"], !ref.isEmpty {
            media.addOption(":http-referrer=\(ref)")
        }

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
        logger.info("Stopping VLC playback")
        mediaPlayer.stop()
        mediaPlayer.drawable = nil
        mediaPlayer.media = nil
        drawableView = nil
        isPlaying = false
        observedBitrateBps = 0
        indicatedBitrateBps = 0
        lastLoggedSecond = -1
    }

    var stateDescription: String {
        switch mediaPlayer.state {
        case .opening: return "opening"
        case .buffering: return "buffering"
        case .playing: return "playing"
        case .paused: return "paused"
        case .stopped: return "stopped"
        case .ended: return "ended"
        case .error: return "error"
        default: return "unknown"
        }
    }

    var videoSize: CGSize? {
        let size = mediaPlayer.videoSize
        guard size.width > 0, size.height > 0 else { return nil }
        return size
    }

    // MARK: - VLCMediaPlayerDelegate

    func mediaPlayerStateChanged(_ aNotification: Notification) {
        let state = mediaPlayer.state
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            switch state {
            case .opening:
                logger.debug("VLC state: opening")
            case .buffering:
                logger.debug("VLC state: buffering")
                self.onBufferingStarted?()
            case .playing:
                logger.info("VLC state: playing")
                self.isPlaying = true
                self.onPlaybackResumed?()
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
                self.isPlaying = false
                self.onFatalError?("VLC playback error")
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
