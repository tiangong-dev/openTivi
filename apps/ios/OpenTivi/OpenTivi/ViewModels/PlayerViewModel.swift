import SwiftUI
import UIKit

@MainActor
final class PlayerViewModel: ObservableObject {
    @Published var currentChannel: ChannelInfo?
    @Published var isPlaying = false
    @Published var isFullScreen = false
    /// nil = follow system rotation; set to force a specific orientation
    @Published var preferredOrientation: UIInterfaceOrientationMask?
    @Published var epgSnapshot: ChannelEpgSnapshot?
    @Published var channelList: [ChannelInfo] = []
    @Published var isLocked = false
    @Published var observedBitrateBps: Double = 0
    @Published var indicatedBitrateBps: Double = 0

    lazy var streamPlayer: StreamPlayer = {
        StreamPlayer()
    }()

    private var bitrateTask: Task<Void, Never>?

    func play(channel: ChannelInfo, allChannels: [ChannelInfo]? = nil) {
        currentChannel = channel
        isPlaying = true
        isFullScreen = true
        if let all = allChannels { channelList = all }
        streamPlayer.play(streamUrl: channel.streamUrl)
        startBitrateObservation()
        Task {
            try? await RustBridge.shared.markRecentWatched(channelId: channel.id)
            await loadEpg(channelId: channel.id)
        }
    }

    func stop() {
        streamPlayer.stop()
        bitrateTask?.cancel()
        bitrateTask = nil
        isPlaying = false
        currentChannel = nil
        epgSnapshot = nil
        observedBitrateBps = 0
        indicatedBitrateBps = 0
    }

    private func startBitrateObservation() {
        bitrateTask?.cancel()
        bitrateTask = Task { [weak self] in
            guard let self else { return }
            for await _ in AsyncStream<Void> { continuation in
                let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                    continuation.yield()
                }
                continuation.onTermination = { _ in timer.invalidate() }
            } {
                guard !Task.isCancelled else { break }
                self.observedBitrateBps = self.streamPlayer.observedBitrateBps
                self.indicatedBitrateBps = self.streamPlayer.indicatedBitrateBps
            }
        }
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
