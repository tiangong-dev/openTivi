import SwiftUI

@main
struct OpenTiviApp: App {
    @StateObject private var playerVM = PlayerViewModel()

    init() {
        let docsDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        RustBridge.shared.initialize(dataDir: docsDir.path)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(playerVM)
                .preferredColorScheme(.dark)
        }
    }
}
