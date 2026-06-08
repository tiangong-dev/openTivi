import AVFoundation
import SwiftUI
import UIKit

/// Video surface backed by an `AVPlayerLayer`. Symmetric to `VLCVideoView`:
/// it attaches/detaches the active backend's drawable (the surface view) so the
/// backend can bind its `AVPlayer` to the layer.
struct AVPlayerLayerView: UIViewRepresentable {
    @ObservedObject var player: StreamPlayer

    func makeUIView(context: Context) -> AVPlayerSurfaceView {
        let view = AVPlayerSurfaceView()
        view.owner = player
        player.attachDrawable(view)
        return view
    }

    func updateUIView(_ uiView: AVPlayerSurfaceView, context: Context) {
        uiView.owner = player
        player.attachDrawable(uiView)
    }

    static func dismantleUIView(_ uiView: AVPlayerSurfaceView, coordinator: ()) {
        uiView.owner?.detachDrawable(uiView)
    }
}

/// UIView whose backing layer is an `AVPlayerLayer`.
final class AVPlayerSurfaceView: UIView {
    weak var owner: StreamPlayer?

    override class var layerClass: AnyClass {
        AVPlayerLayer.self
    }

    var playerLayer: AVPlayerLayer {
        // Safe: layerClass guarantees the backing layer type.
        // swiftlint:disable:next force_cast
        layer as! AVPlayerLayer
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        isUserInteractionEnabled = false
        playerLayer.videoGravity = .resizeAspect
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
