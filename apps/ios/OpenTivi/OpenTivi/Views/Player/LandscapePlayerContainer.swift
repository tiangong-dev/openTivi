import SwiftUI
import UIKit

/// Full-screen player host. On iPhone the interface orientation stays portrait so rotating
/// the device does not re-layout the player; in-player "landscape" uses a view transform.
/// iPad keeps all orientations so the shell can follow the user / system.
struct FullScreenPlayerContainer<Content: View>: UIViewControllerRepresentable {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    func makeUIViewController(context: Context) -> FullScreenHostingController<Content> {
        FullScreenHostingController(rootView: content)
    }

    func updateUIViewController(_ uiViewController: FullScreenHostingController<Content>, context: Context) {
        uiViewController.rootView = content
    }
}

final class FullScreenHostingController<Content: View>: UIHostingController<Content> {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if UIDevice.current.userInterfaceIdiom == .pad {
            return .allButUpsideDown
        }
        return .portrait
    }

    override var prefersStatusBarHidden: Bool {
        true
    }
}
