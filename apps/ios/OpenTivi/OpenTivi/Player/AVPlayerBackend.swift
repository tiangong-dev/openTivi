import AVFoundation
import CoreGraphics
import Foundation
import os.log
import UIKit

private let logger = Logger(subsystem: "com.opentivi.ios", category: "AVPlayerBackend")

/// AVPlayer-backed playback engine — the primary backend for HLS / native
/// streams. Falls back to `VLCPlayerBackend` (handled by `StreamPlayer`) when it
/// hits a fatal error such as an unsupported codec.
final class AVPlayerBackend: NSObject, VideoPlayerBackend {
    let kind: PlayerBackendKind = .avplayer

    var onBufferingStarted: (() -> Void)?
    var onPlaybackResumed: (() -> Void)?
    var onFatalError: ((String) -> Void)?

    private(set) var isPlaying = false
    private(set) var indicatedBitrateBps: Double = 0

    /// Exposed so `AVPlayerLayerView` can bind the player to its layer.
    let player = AVPlayer()

    private var currentItem: AVPlayerItem?
    private weak var drawableView: UIView?

    /// Picture-in-Picture controller — only meaningful for the AVPlayer backend.
    /// Created lazily once a surface (AVPlayerLayer) is attached.
    private var pipController: AVPictureInPictureController?

    /// Error codes that indicate an unsupported/undecodable codec — the strongest
    /// signal to fall back to VLC.
    private static let unsupportedCodecCodes: Set<Int> = [-11828, -11800, -12939]

    // KVO contexts
    private var statusObservation: NSKeyValueObservation?
    private var bufferEmptyObservation: NSKeyValueObservation?
    private var likelyToKeepUpObservation: NSKeyValueObservation?
    private var timeControlObservation: NSKeyValueObservation?

    override init() {
        super.init()
        configureAudioSession()
        timeControlObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isPlaying = (player.timeControlStatus == .playing)
            }
        }
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
            logger.info("Audio session configured for playback")
        } catch {
            logger.error("Failed to configure audio session: \(error.localizedDescription)")
        }
    }

    func attachDrawable(_ view: UIView) {
        drawableView = view
        if let surface = view as? AVPlayerSurfaceView {
            surface.playerLayer.player = player
            setupPiPIfNeeded(layer: surface.playerLayer)
        }
    }

    // MARK: - Picture in Picture (AVPlayer backend only)

    private func setupPiPIfNeeded(layer: AVPlayerLayer) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            logger.info("PiP not supported on this device")
            return
        }
        guard pipController?.playerLayer !== layer else { return }
        pipController = AVPictureInPictureController(playerLayer: layer)
    }

    /// Whether PiP can be started right now.
    var isPictureInPicturePossible: Bool {
        AVPictureInPictureController.isPictureInPictureSupported()
            && (pipController?.isPictureInPicturePossible ?? false)
    }

    func startPictureInPicture() {
        guard isPictureInPicturePossible else { return }
        pipController?.startPictureInPicture()
    }

    func stopPictureInPicture() {
        pipController?.stopPictureInPicture()
    }

    func detachDrawable(_ view: UIView) {
        guard drawableView === view else { return }
        if let surface = view as? AVPlayerSurfaceView, surface.playerLayer.player === player {
            surface.playerLayer.player = nil
        }
        drawableView = nil
    }

    func play(url: URL, headers: [String: String]) {
        logger.info("Playing stream with AVPlayer: \(url.absoluteString)")

        teardownItemObservers()

        let options: [String: Any]? = headers.isEmpty
            ? nil
            : [AVURLAssetHTTPHeaderFieldsKey: headers]
        let asset = AVURLAsset(url: url, options: options)
        let item = AVPlayerItem(asset: asset)
        currentItem = item

        indicatedBitrateBps = 0

        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if item.status == .failed {
                    let err = item.error as NSError?
                    self.handleFatal(error: err, context: "item status .failed")
                }
            }
        }

        bufferEmptyObservation = item.observe(\.isPlaybackBufferEmpty, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if item.isPlaybackBufferEmpty {
                    logger.debug("AVPlayer buffer empty -> buffering")
                    self.onBufferingStarted?()
                }
            }
        }

        likelyToKeepUpObservation = item.observe(\.isPlaybackLikelyToKeepUp, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if item.isPlaybackLikelyToKeepUp {
                    logger.debug("AVPlayer likely to keep up -> resumed")
                    self.onPlaybackResumed?()
                }
            }
        }

        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(itemFailedToPlayToEnd(_:)),
            name: .AVPlayerItemFailedToPlayToEndTime,
            object: item
        )
        center.addObserver(
            self,
            selector: #selector(itemDidPlayToEnd(_:)),
            name: .AVPlayerItemDidPlayToEndTime,
            object: item
        )

        player.replaceCurrentItem(with: item)
        player.play()
    }

    func stop() {
        logger.info("Stopping AVPlayer playback")
        player.pause()
        teardownItemObservers()
        player.replaceCurrentItem(with: nil)
        currentItem = nil
        isPlaying = false
        indicatedBitrateBps = 0
    }

    var observedBitrateBps: Double {
        guard let event = currentItem?.accessLog()?.events.last else { return 0 }
        let rate = event.observedBitrate
        return rate.isFinite && rate > 0 ? rate : 0
    }

    var stateDescription: String {
        guard let item = currentItem else { return "idle" }
        if item.status == .failed { return "error" }
        if player.timeControlStatus == .playing { return "playing" }
        if item.isPlaybackBufferEmpty { return "buffering" }
        if item.status == .unknown { return "opening" }
        return "paused"
    }

    var videoSize: CGSize? {
        guard let track = currentItem?.asset.tracks(withMediaType: .video).first else { return nil }
        let size = track.naturalSize.applying(track.preferredTransform)
        let w = abs(size.width), h = abs(size.height)
        guard w > 0, h > 0 else { return nil }
        return CGSize(width: w, height: h)
    }

    // MARK: - Notifications

    @objc private func itemFailedToPlayToEnd(_ note: Notification) {
        let err = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? NSError
        DispatchQueue.main.async { [weak self] in
            self?.handleFatal(error: err, context: "FailedToPlayToEndTime")
        }
    }

    @objc private func itemDidPlayToEnd(_ note: Notification) {
        DispatchQueue.main.async { [weak self] in
            self?.isPlaying = false
        }
    }

    // MARK: - Helpers

    private func handleFatal(error: NSError?, context: String) {
        let code = error?.code
        let unsupported = code.map(Self.unsupportedCodecCodes.contains) ?? false
        let reason = error?.localizedDescription ?? "AVPlayer fatal error"
        logger.error("AVPlayer fatal (\(context)) code=\(code ?? 0) unsupported=\(unsupported): \(reason)")
        isPlaying = false
        onFatalError?(reason)
    }

    private func teardownItemObservers() {
        statusObservation?.invalidate()
        statusObservation = nil
        bufferEmptyObservation?.invalidate()
        bufferEmptyObservation = nil
        likelyToKeepUpObservation?.invalidate()
        likelyToKeepUpObservation = nil
        if let item = currentItem {
            NotificationCenter.default.removeObserver(self, name: .AVPlayerItemFailedToPlayToEndTime, object: item)
            NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: item)
        }
    }

    deinit {
        teardownItemObservers()
        timeControlObservation?.invalidate()
    }
}
