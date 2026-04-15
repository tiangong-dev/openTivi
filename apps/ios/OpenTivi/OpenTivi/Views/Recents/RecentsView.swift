import SwiftUI

struct RecentsView: View {
    @StateObject private var vm = RecentsViewModel()
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

    var body: some View {
        List {
            ForEach(vm.recents) { recent in
                HStack(spacing: 12) {
                    ChannelLogo(url: recent.logoUrl, size: 44)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(recent.name)
                            .font(.tiviH4)
                            .lineLimit(1)

                        HStack(spacing: 8) {
                            Text(relativeTime(recent.lastWatchedAt))
                                .font(.tiviCaption)
                                .foregroundColor(.tiviMutedForeground)
                            Text("·")
                                .foregroundColor(.tiviMutedForeground)
                            Text(locale.t("recents.playedCount", ["count": "\(recent.playCount)"]))
                                .font(.tiviCaption)
                                .foregroundColor(.tiviMutedForeground)
                        }
                    }

                    Spacer()

                    Image(systemName: "play.circle")
                        .font(.title3)
                        .foregroundColor(.tiviPrimary)
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
        .contentMargins(.bottom, 100, for: .scrollContent)
        .refreshable { await vm.load() }
        .navigationTitle(locale.t("recents.title"))
        .overlay {
            if vm.recents.isEmpty && !vm.isLoading {
                VStack(spacing: 12) {
                    Image(systemName: "clock")
                        .font(.system(size: 32))
                        .foregroundColor(.tiviMutedForeground)
                    Text(locale.t("recents.noRecents"))
                        .font(.tiviH3)
                    Text(locale.t("recents.watchHint"))
                        .font(.tiviSmall)
                        .foregroundColor(.tiviMutedForeground)
                }
            }
            if vm.isLoading && vm.recents.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }

    private func relativeTime(_ isoString: String) -> String {
        isoString.toDate()?.relativeDescription() ?? isoString
    }
}
