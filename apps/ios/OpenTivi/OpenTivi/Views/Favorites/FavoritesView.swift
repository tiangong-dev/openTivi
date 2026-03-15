import SwiftUI

struct FavoritesView: View {
    @StateObject private var vm = FavoritesViewModel()
    @EnvironmentObject var playerVM: PlayerViewModel

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 12)]

    var body: some View {
        ScrollView {
            if vm.favorites.isEmpty && !vm.isLoading {
                ContentUnavailableView(
                    "No Favorites",
                    systemImage: "star",
                    description: Text("Swipe right on a channel and tap ★ to add it here.")
                )
                .padding(.top, 100)
            } else {
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(vm.favorites) { channel in
                        VStack(spacing: 6) {
                            ChannelLogo(url: channel.logoUrl, size: 60)
                            Text(channel.name)
                                .font(.caption)
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .onTapGesture {
                            playerVM.play(channel: channel, allChannels: vm.favorites)
                        }
                    }
                }
                .padding()
            }
        }
        .refreshable { await vm.load() }
        .navigationTitle("Favorites")
        .overlay {
            if vm.isLoading && vm.favorites.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }
}
