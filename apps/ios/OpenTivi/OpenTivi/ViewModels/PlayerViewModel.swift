import SwiftUI
import AVFoundation

@MainActor
final class PlayerViewModel: ObservableObject {
    @Published var currentChannel: ChannelInfo?
    @Published var isPlaying = false
    @Published var isFullScreen = false
    @Published var epgSnapshot: ChannelEpgSnapshot?
    @Published var channelList: [ChannelInfo] = []

    lazy var streamPlayer: StreamPlayer = {
        StreamPlayer(proxyPort: RustBridge.shared.proxyPort)
    }()

    func play(channel: ChannelInfo, allChannels: [ChannelInfo]? = nil) {
        currentChannel = channel
        isPlaying = true
        if let all = allChannels { channelList = all }
        streamPlayer.play(streamUrl: channel.streamUrl)
        Task {
            try? await RustBridge.shared.markRecentWatched(channelId: channel.id)
            await loadEpg(channelId: channel.id)
        }
    }

    func stop() {
        streamPlayer.stop()
        isPlaying = false
        currentChannel = nil
        epgSnapshot = nil
    }

    func nextChannel() {
        guard let current = currentChannel,
              let index = channelList.firstIndex(where: { $0.id == current.id }),
              index + 1 < channelList.count else { return }
        play(channel: channelList[index + 1])
    }

    func previousChannel() {
        guard let current = currentChannel,
              let index = channelList.firstIndex(where: { $0.id == current.id }),
              index > 0 else { return }
        play(channel: channelList[index - 1])
    }

    private func loadEpg(channelId: Int64) async {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        do {
            let snapshots = try await RustBridge.shared.fetchEpgSnapshots(
                channelIds: [channelId],
                windowStart: now - 15 * 60 * 1000,
                windowEnd: now + 4 * 60 * 60 * 1000
            )
            epgSnapshot = snapshots.first
        } catch {
            epgSnapshot = nil
        }
    }
}
