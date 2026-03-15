import SwiftUI

struct ContentView: View {
    @EnvironmentObject var playerVM: PlayerViewModel
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
                .tabItem { Label("Channels", systemImage: "tv") }
                .tag(Tab.channels)

                NavigationStack {
                    FavoritesView()
                }
                .tabItem { Label("Favorites", systemImage: "star.fill") }
                .tag(Tab.favorites)

                NavigationStack {
                    RecentsView()
                }
                .tabItem { Label("Recents", systemImage: "clock") }
                .tag(Tab.recents)

                NavigationStack {
                    SourcesView()
                }
                .tabItem { Label("Sources", systemImage: "antenna.radiowaves.left.and.right") }
                .tag(Tab.sources)

                NavigationStack {
                    SettingsView()
                }
                .tabItem { Label("Settings", systemImage: "gearshape") }
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
