import SwiftUI

struct ChannelsView: View {
    @StateObject private var vm = ChannelsViewModel()
    @EnvironmentObject var playerVM: PlayerViewModel

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
                                channel.isFavorite ? "Unfavorite" : "Favorite",
                                systemImage: channel.isFavorite ? "star.slash" : "star.fill"
                            )
                        }
                        .tint(.yellow)
                    }
            }
        }
        .listStyle(.plain)
        .searchable(text: $vm.searchText, prompt: "Search channels...")
        .refreshable { await vm.loadChannels() }
        .navigationTitle("Channels")
        .overlay {
            if vm.isLoading && vm.channels.isEmpty {
                LoadingView()
            } else if vm.filteredChannels.isEmpty && !vm.isLoading {
                ContentUnavailableView(
                    "No Channels",
                    systemImage: "tv.slash",
                    description: Text("Import a source to get started.")
                )
            }
        }
        .task {
            await vm.loadChannels()
            await vm.loadGroups()
        }
    }
}
