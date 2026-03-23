import SwiftUI

struct ChannelsView: View {
    @StateObject private var vm = ChannelsViewModel()
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

    var body: some View {
        List {
            if !vm.groups.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    GroupFilterChips(
                        groups: vm.groups,
                        selected: $vm.selectedGroup
                    )
                }
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
            }

            ForEach(vm.filteredChannels) { channel in
                ChannelRow(channel: channel)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        playerVM.play(channel: channel, allChannels: vm.filteredChannels)
                    }
                    .swipeActions(edge: .trailing) {
                        Button {
                            vm.toggleFavorite(channelId: channel.id)
                        } label: {
                            Label(
                                channel.isFavorite ? locale.t("channels.unfavorite") : locale.t("channels.favorite"),
                                systemImage: channel.isFavorite ? "star.slash" : "star.fill"
                            )
                        }
                        .tint(.yellow)
                    }
            }
        }
        .listStyle(.plain)
        .searchable(text: $vm.searchText, prompt: Text(locale.t("channels.searchPlaceholder")))
        .refreshable { await vm.loadChannels() }
        .navigationTitle(locale.t("nav.channels"))
        .overlay {
            if vm.isLoading && vm.channels.isEmpty {
                LoadingView()
            } else if vm.filteredChannels.isEmpty && !vm.isLoading {
                VStack(spacing: 12) {
                    Image(systemName: "tv.slash")
                        .font(.system(size: 36))
                        .foregroundColor(.secondary)
                    Text(locale.t("channels.noChannels"))
                        .font(.headline)
                    Text(locale.t("channels.importHint"))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
        .task {
            await vm.loadChannels()
            await vm.loadGroups()
        }
    }
}
