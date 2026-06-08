import SwiftUI
import UIKit

/// Video surface backed by VLCMediaPlayer.drawable.
struct VLCVideoView: UIViewRepresentable {
    @ObservedObject var player: StreamPlayer

    func makeUIView(context: Context) -> VLCPlayerSurfaceView {
        let view = VLCPlayerSurfaceView()
        view.owner = player
        player.attachDrawable(view)
        return view
    }

    func updateUIView(_ uiView: VLCPlayerSurfaceView, context: Context) {
        uiView.owner = player
        player.attachDrawable(uiView)
    }

    static func dismantleUIView(_ uiView: VLCPlayerSurfaceView, coordinator: ()) {
        uiView.owner?.detachDrawable(uiView)
    }
}

final class VLCPlayerSurfaceView: UIView {
    weak var owner: StreamPlayer?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        isUserInteractionEnabled = false
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
