import SwiftUI

@main
struct OpenTiviApp: App {
    @StateObject private var playerVM = PlayerViewModel()
    @ObservedObject private var bridge = RustBridge.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if bridge.isInitialized {
                    ContentView()
                        .environmentObject(playerVM)
                } else {
                    ProgressView("Loading…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black)
                }
            }
            .preferredColorScheme(.dark)
            .task {
                await bridge.initializeAsync()
            }
        }
    }
}
