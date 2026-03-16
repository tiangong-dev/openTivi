import SwiftUI

struct ContentView: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared
    @State private var selectedTab: Tab = .channels

    enum Tab: String {
        case channels, favorites, recents, sources, settings
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                NavigationStack {
                    ChannelsView()
                }
                .tabItem { Label(locale.t("nav.channels"), systemImage: "tv") }
                .tag(Tab.channels)

                NavigationStack {
                    FavoritesView()
                }
                .tabItem { Label(locale.t("nav.favorites"), systemImage: "star.fill") }
                .tag(Tab.favorites)

                NavigationStack {
                    RecentsView()
                }
                .tabItem { Label(locale.t("nav.recents"), systemImage: "clock") }
                .tag(Tab.recents)

                NavigationStack {
                    SourcesView()
                }
                .tabItem { Label(locale.t("nav.sources"), systemImage: "antenna.radiowaves.left.and.right") }
                .tag(Tab.sources)

                NavigationStack {
                    SettingsView()
                }
                .tabItem { Label(locale.t("nav.settings"), systemImage: "gearshape") }
                .tag(Tab.settings)
            }

            if playerVM.isPlaying {
                MiniPlayerBar()
                    .environmentObject(playerVM)
                    .transition(.move(edge: .bottom))
                    .padding(.bottom, 49) // above tab bar
            }
        }
    }
}
