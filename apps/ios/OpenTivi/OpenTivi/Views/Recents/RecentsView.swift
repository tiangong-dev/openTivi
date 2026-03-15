import SwiftUI

struct RecentsView: View {
    @StateObject private var vm = RecentsViewModel()
    @EnvironmentObject var playerVM: PlayerViewModel

    var body: some View {
        List {
            ForEach(vm.recents) { recent in
                HStack(spacing: 12) {
                    ChannelLogo(url: recent.logoUrl, size: 44)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(recent.name)
                            .font(.body)
                            .fontWeight(.medium)
                            .lineLimit(1)

                        HStack(spacing: 8) {
                            Text(relativeTime(recent.lastWatchedAt))
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text("·")
                                .foregroundColor(.secondary)
                            Text("\(recent.playCount)× played")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    Image(systemName: "play.circle")
                        .font(.title3)
                        .foregroundColor(.accentColor)
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    let channel = ChannelInfo(
                        id: recent.id,
                        sourceId: recent.sourceId,
                        name: recent.name,
                        channelNumber: recent.channelNumber,
                        groupName: nil,
                        tvgId: nil,
                        logoUrl: recent.logoUrl,
                        streamUrl: recent.streamUrl,
                        isFavorite: recent.isFavorite
                    )
                    playerVM.play(channel: channel)
                }
            }
        }
        .listStyle(.plain)
        .refreshable { await vm.load() }
        .navigationTitle("Recents")
        .overlay {
            if vm.recents.isEmpty && !vm.isLoading {
                ContentUnavailableView(
                    "No Recents",
                    systemImage: "clock",
                    description: Text("Channels you watch will appear here.")
                )
            }
            if vm.isLoading && vm.recents.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }

    private func relativeTime(_ isoString: String) -> String {
        // Simplified relative time
        return isoString
    }
}
