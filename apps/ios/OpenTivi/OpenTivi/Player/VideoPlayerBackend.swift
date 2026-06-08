import CoreGraphics
import Foundation
import UIKit

/// Identifies which concrete playback engine a backend wraps.
enum PlayerBackendKind {
    case avplayer
    case vlc
}

/// Common surface for both the AVPlayer-primary backend and the VLCKit fallback.
///
/// `StreamPlayer` acts as a façade over one of these and forwards published
/// state plus the three lifecycle callbacks to the view model.
protocol VideoPlayerBackend: AnyObject {
    /// Which engine this backend wraps.
    var kind: PlayerBackendKind { get }

    /// Start (or restart) playback of `url`, injecting `headers` (e.g. User-Agent,
    /// Referer) into the underlying request where the engine supports it.
    func play(url: URL, headers: [String: String])

    /// Stop playback and release the current media.
    func stop()

    /// Whether the engine currently reports active playback.
    var isPlaying: Bool { get }

    /// Observed network bitrate in bits/sec (0 when unknown).
    var observedBitrateBps: Double { get }

    /// Indicated/demux bitrate in bits/sec (0 when unknown).
    var indicatedBitrateBps: Double { get }

    /// Normalized state string from the shared vocabulary:
    /// opening / buffering / playing / paused / ended / error / stopped / idle.
    var stateDescription: String { get }

    /// Natural video size if known.
    var videoSize: CGSize? { get }

    // MARK: Lifecycle callbacks (invoked on the main thread)

    /// Called when the engine enters a buffering / stall state.
    var onBufferingStarted: (() -> Void)? { get set }
    /// Called when the engine returns to smooth playback.
    var onPlaybackResumed: (() -> Void)? { get set }
    /// Called with a human-readable reason on a fatal/unrecoverable error.
    var onFatalError: ((String) -> Void)? { get set }

    // MARK: Surface attachment

    /// Attach the rendering surface (VLC drawable / AVPlayerLayer host).
    func attachDrawable(_ view: UIView)
    /// Detach the rendering surface.
    func detachDrawable(_ view: UIView)
}
