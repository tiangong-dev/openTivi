import SwiftUI
import UIKit

struct FullScreenPlayerContainer<Content: View>: UIViewControllerRepresentable {
    let content: Content
    @Binding var preferredOrientation: UIInterfaceOrientationMask?

    init(preferredOrientation: Binding<UIInterfaceOrientationMask?>, @ViewBuilder content: () -> Content) {
        self._preferredOrientation = preferredOrientation
        self.content = content()
    }

    func makeUIViewController(context: Context) -> FullScreenHostingController<Content> {
        FullScreenHostingController(rootView: content)
    }

    func updateUIViewController(_ uiViewController: FullScreenHostingController<Content>, context: Context) {
        uiViewController.rootView = content
        guard let target = preferredOrientation,
              uiViewController.currentMask != target else { return }
        uiViewController.currentMask = target
        uiViewController.setNeedsUpdateOfSupportedInterfaceOrientations()
        uiViewController.requestOrientation(target)
    }
}

final class FullScreenHostingController<Content: View>: UIHostingController<Content> {
    var currentMask: UIInterfaceOrientationMask = .allButUpsideDown

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        currentMask
    }

    override var prefersStatusBarHidden: Bool {
        true
    }

    func requestOrientation(_ orientation: UIInterfaceOrientationMask) {
        guard let windowScene = view.window?.windowScene else { return }
        windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: orientation)) { error in
            print("Orientation update failed: \(error.localizedDescription)")
        }
        UIViewController.attemptRotationToDeviceOrientation()
    }
}
