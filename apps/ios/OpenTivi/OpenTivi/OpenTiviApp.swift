import SwiftUI

@main
struct OpenTiviApp: App {
    @StateObject private var playerVM = PlayerViewModel()
    @StateObject private var bridge = RustBridge.shared
    private let appLaunchUptime = ProcessInfo.processInfo.systemUptime

    init() {
        configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if bridge.isInitialized {
                    ContentView()
                        .environmentObject(playerVM)
                } else {
                    ProgressView("Loading…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.tiviBackground)
                }
            }
            .preferredColorScheme(.dark)
            .task {
                RustBridge.logStartup(
                    "App task started, waiting for bridge initialization",
                    since: appLaunchUptime
                )
                await bridge.initializeAsync()
                RustBridge.logStartup(
                    "App task finished bridge initialization",
                    since: appLaunchUptime
                )
            }
        }
    }

    private func configureAppearance() {
        // Translucent navigation bar with blur
        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithDefaultBackground()
        navAppearance.backgroundEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
        navAppearance.backgroundColor = UIColor(white: 0.06, alpha: 0.6)
        navAppearance.shadowColor = .clear
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = {
            let edge = UINavigationBarAppearance()
            edge.configureWithTransparentBackground()
            edge.shadowColor = .clear
            return edge
        }()

        // Keep tab bar hidden if any system TabView is used
        UITabBar.appearance().isHidden = true
    }
}
