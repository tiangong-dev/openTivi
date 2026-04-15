import SwiftUI

struct FavoritesView: View {
    @StateObject private var vm = FavoritesViewModel()
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 16)]

    var body: some View {
        ScrollView {
            if vm.favorites.isEmpty && !vm.isLoading {
                VStack(spacing: 12) {
                    Image(systemName: "star")
                        .font(.system(size: 32))
                        .foregroundColor(.tiviMutedForeground)
                    Text(locale.t("favorites.noFavorites"))
                        .font(.tiviH3)
                    Text(locale.t("favorites.addHint"))
                        .font(.tiviSmall)
                        .foregroundColor(.tiviMutedForeground)
                        .multilineTextAlignment(.center)
                }
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
        .contentMargins(.bottom, 100, for: .scrollContent)
        .refreshable { await vm.load() }
        .navigationTitle(locale.t("favorites.title"))
        .overlay {
            if vm.isLoading && vm.favorites.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }
}
