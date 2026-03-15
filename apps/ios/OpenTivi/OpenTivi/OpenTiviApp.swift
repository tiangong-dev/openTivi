import SwiftUI

@main
struct OpenTiviApp: App {
    @StateObject private var playerVM = PlayerViewModel()

    init() {
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
        RustBridge.shared.initialize(dataDir: appSupportDir.path)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(playerVM)
                .preferredColorScheme(.dark)
        }
    }
}
