import SwiftUI

struct ChannelsView: View {
    @StateObject private var vm = ChannelsViewModel()
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared
    @State private var showEpgSearch = false

    var body: some View {
        List {
            // Source filter + Sort + EPG search row
            if !vm.sources.isEmpty || !vm.groups.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    // Source filter chips
                    if !vm.sources.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                chipButton(label: locale.t("channels.allSources"), isSelected: vm.selectedSourceId == nil) {
                                    vm.selectedSourceId = nil
                                    vm.selectedGroup = nil
                                    Task { await vm.loadGroups() }
                                }
                                ForEach(vm.sources) { source in
                                    chipButton(label: source.name, isSelected: vm.selectedSourceId == source.id) {
                                        vm.selectedSourceId = source.id
                                        vm.selectedGroup = nil
                                        Task { await vm.loadGroups() }
                                    }
                                }
                            }
                            .padding(.horizontal)
                        }
                    }

                    // Group filter chips
                    if !vm.groups.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            GroupFilterChips(
                                groups: vm.groups,
                                selected: $vm.selectedGroup
                            )
                        }
                    }

                    // Sort picker + EPG search button
                    HStack {
                        Menu {
                            ForEach(ChannelSort.allCases, id: \.self) { sort in
                                Button {
                                    vm.sortBy = sort
                                } label: {
                                    HStack {
                                        Text(sortLabel(sort))
                                        if vm.sortBy == sort {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "arrow.up.arrow.down")
                                    .font(.caption)
                                Text(locale.t("channels.sort"))
                                    .font(.subheadline)
                            }
                            .foregroundColor(.tiviPrimary)
                        }

                        Spacer()

                        Button {
                            showEpgSearch = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "magnifyingglass")
                                    .font(.caption)
                                Text(locale.t("epg.explorer.title"))
                                    .font(.subheadline)
                            }
                            .foregroundColor(.tiviPrimary)
                        }
                    }
                    .padding(.horizontal)
                }
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
            }

            ForEach(vm.filteredChannels) { channel in
                NavigationLink {
                    ChannelDetailView(
                        channel: channel,
                        allChannels: vm.filteredChannels
                    )
                        .environmentObject(playerVM)
                } label: {
                    ChannelRow(channel: channel)
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
                        .tint(.tiviFavorite)
                    }
            }
        }
        .listStyle(.plain)
        .contentMargins(.bottom, 100, for: .scrollContent)
        .searchable(text: $vm.searchText, prompt: Text(locale.t("channels.searchPlaceholder")))
        .refreshable { await vm.loadChannels() }
        .navigationTitle(locale.t("nav.channels"))
        .overlay {
            if vm.isLoading && vm.channels.isEmpty {
                LoadingView()
            } else if vm.filteredChannels.isEmpty && !vm.isLoading {
                VStack(spacing: 12) {
                    Image(systemName: "tv.slash")
                        .font(.system(size: 32))
                        .foregroundColor(.tiviMutedForeground)
                    Text(locale.t("channels.noChannels"))
                        .font(.tiviH3)
                    Text(locale.t("channels.importHint"))
                        .font(.tiviSmall)
                        .foregroundColor(.tiviMutedForeground)
                }
            }
        }
        .sheet(isPresented: $showEpgSearch) {
            EpgSearchView()
                .environmentObject(playerVM)
        }
        .task {
            await vm.loadChannels()
            await vm.loadGroups()
            await vm.loadSources()
        }
    }

    private func sortLabel(_ sort: ChannelSort) -> String {
        switch sort {
        case .channelNumber: return locale.t("channels.sort.channelNumber")
        case .name: return locale.t("channels.sort.name")
        case .sourceThenChannel: return locale.t("channels.sort.sourceThenChannel")
        }
    }

    private func chipButton(label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .fontWeight(isSelected ? .semibold : .regular)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background {
                    if isSelected {
                        Capsule().fill(Color.tiviPrimary)
                    } else {
                        Capsule().fill(.ultraThinMaterial)
                    }
                }
                .foregroundColor(isSelected ? .tiviPrimaryForeground : .tiviForeground)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
