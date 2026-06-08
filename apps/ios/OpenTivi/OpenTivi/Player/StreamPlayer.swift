import AVFoundation
import CoreGraphics
import Foundation
import os.log
import UIKit

private let logger = Logger(subsystem: "com.opentivi.ios", category: "StreamPlayer")

/// Façade / switcher over a concrete `VideoPlayerBackend`.
///
/// Holds the `current` backend (VLC by default), forwards its published state to
/// the view model, and owns the backend-level fallback policy: when an AVPlayer
/// backend hits a fatal error on a candidate that has not yet fallen back, it
/// transparently switches to VLC with the same url/headers. This fallback is
/// invisible to the view model — its `recordStallEvent` / candidate logic is
/// untouched.
final class StreamPlayer: NSObject, ObservableObject {
    @Published var isPlaying = false
    @Published var error: String?
    @Published var observedBitrateBps: Double = 0
    @Published var indicatedBitrateBps: Double = 0

    /// Called on the main thread when the active backend enters buffering.
    var onBufferingStarted: (() -> Void)?
    /// Called on the main thread when the active backend resumes playback.
    var onPlaybackResumed: (() -> Void)?

    /// The currently active backend. View layer reads `.kind` to pick its surface.
    private(set) var current: VideoPlayerBackend

    private weak var drawableView: UIView?

    /// Last url/headers, used to replay on backend fallback.
    private var lastURL: URL?
    private var lastHeaders: [String: String] = [:]
    /// Whether the current candidate has already fallen back AVPlayer -> VLC.
    /// Reset on every explicit `play(...)` so each new candidate gets one shot.
    private var didFallBackThisCandidate = false

    /// Reused backend instances to avoid churn / repeated AudioSession setup.
    private let vlcBackend = VLCPlayerBackend()
    private lazy var avplayerBackend = AVPlayerBackend()

    override init() {
        // Default to VLC to preserve prior behavior until a play(...) routes.
        self.current = vlcBackend
        super.init()
        logger.info("StreamPlayer initialized (façade, default backend = VLC)")
        wireCallbacks(for: current)
    }

    // MARK: - Surface attachment

    func attachDrawable(_ view: UIView) {
        drawableView = view
        current.attachDrawable(view)
    }

    func detachDrawable(_ view: UIView) {
        if drawableView === view { drawableView = nil }
        current.detachDrawable(view)
    }

    // MARK: - Playback entry points

    /// Backend-routed entry point. `backend` selects the initial engine for this
    /// candidate; the façade may still fall back internally on a fatal error.
    func play(url: URL, headers: [String: String], backend: PlayerBackendKind) {
        lastURL = url
        lastHeaders = headers
        didFallBackThisCandidate = false
        error = nil
        observedBitrateBps = 0
        indicatedBitrateBps = 0

        let target = self.backend(for: backend)
        if target !== current {
            switchBackend(to: backend, attachingTo: drawableView, replay: false)
        }
        current.play(url: url, headers: headers)
    }

    /// Convenience for callers that still pass a string URL (e.g. legacy paths).
    func play(streamUrl: String, headers: [String: String] = [:], backend: PlayerBackendKind = .vlc) {
        guard let url = URL(string: streamUrl) else {
            logger.error("Invalid stream URL: \(streamUrl)")
            error = "Invalid stream URL"
            return
        }
        play(url: url, headers: headers, backend: backend)
    }

    func stop() {
        logger.info("StreamPlayer stop")
        current.stop()
        drawableView = nil
        lastURL = nil
        lastHeaders = [:]
        didFallBackThisCandidate = false
        error = nil
        isPlaying = false
        observedBitrateBps = 0
        indicatedBitrateBps = 0
    }

    // MARK: - Backend switching

    private func backend(for kind: PlayerBackendKind) -> VideoPlayerBackend {
        switch kind {
        case .avplayer: return avplayerBackend
        case .vlc: return vlcBackend
        }
    }

    /// Stop the old backend, swap `current`, rewire callbacks, and re-attach the
    /// rendering surface. When `replay` is true, restarts the last url/headers on
    /// the new backend.
    func switchBackend(to kind: PlayerBackendKind, attachingTo view: UIView?, replay: Bool) {
        let next = backend(for: kind)
        guard next !== current else {
            if replay, let url = lastURL { next.play(url: url, headers: lastHeaders) }
            return
        }

        logger.info("Switching backend \(String(describing: self.current.kind)) -> \(String(describing: kind))")

        if let view = drawableView {
            current.detachDrawable(view)
        }
        current.stop()

        // Drop callbacks from the outgoing backend so it can't drive UI anymore.
        current.onBufferingStarted = nil
        current.onPlaybackResumed = nil
        current.onFatalError = nil

        current = next
        wireCallbacks(for: current)

        let surface = view ?? drawableView
        if let surface {
            drawableView = surface
            current.attachDrawable(surface)
        }

        if replay, let url = lastURL {
            current.play(url: url, headers: lastHeaders)
        }
    }

    // MARK: - Callback wiring & fallback policy

    private func wireCallbacks(for backend: VideoPlayerBackend) {
        backend.onBufferingStarted = { [weak self] in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isPlaying = self.current.isPlaying
                self.onBufferingStarted?()
            }
        }
        backend.onPlaybackResumed = { [weak self] in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isPlaying = self.current.isPlaying
                self.error = nil
                self.onPlaybackResumed?()
            }
        }
        backend.onFatalError = { [weak self] reason in
            DispatchQueue.main.async {
                self?.handleFatalError(reason)
            }
        }
    }

    /// Backend-level fatal-error policy.
    ///
    /// - AVPlayer fatal & not yet fallen back this candidate -> silently switch
    ///   to VLC with the same url/headers (no error bubbled to the view model, so
    ///   stall/candidate logic stays transparent).
    /// - Otherwise (already VLC, or already fell back) -> bubble up via the
    ///   `onBufferingStarted` hook is NOT appropriate; instead surface `error` so
    ///   the view model's existing retry/candidate switching can take over.
    private func handleFatalError(_ reason: String) {
        if current.kind == .avplayer, !didFallBackThisCandidate, lastURL != nil {
            logger.error("AVPlayer fatal, falling back to VLC: \(reason)")
            didFallBackThisCandidate = true
            switchBackend(to: .vlc, attachingTo: drawableView, replay: true)
            return
        }
        logger.error("Backend fatal (no further fallback): \(reason)")
        error = reason
        isPlaying = false
        // Reuse the buffering hook so the view model's stall counter advances and
        // its candidate-switch mechanism eventually engages on hard failures too.
        onBufferingStarted?()
    }

    // MARK: - Forwarded state

    var stateDescription: String { current.stateDescription }
    var videoSize: CGSize? { current.videoSize }
    var activeBackendKind: PlayerBackendKind { current.kind }

    /// Pull live bitrate/state from the active backend. Called by the view model's
    /// 1 Hz observation loop.
    func sampleState() {
        observedBitrateBps = current.observedBitrateBps
        indicatedBitrateBps = current.indicatedBitrateBps
        isPlaying = current.isPlaying
    }

    // MARK: - Picture in Picture (AVPlayer backend only)

    /// PiP is only available when the active backend is AVPlayer.
    var isPictureInPicturePossible: Bool {
        (current as? AVPlayerBackend)?.isPictureInPicturePossible ?? false
    }

    func startPictureInPicture() {
        (current as? AVPlayerBackend)?.startPictureInPicture()
    }

    func stopPictureInPicture() {
        (current as? AVPlayerBackend)?.stopPictureInPicture()
    }
}
