import SwiftUI

@MainActor
final class PlayerViewModel: ObservableObject {
    @Published var currentChannel: ChannelInfo?
    @Published var isPlaying = false
    @Published var isFullScreen = false
    @Published var isVideoLandscape = false
    @Published var epgSnapshot: ChannelEpgSnapshot?
    @Published var channelList: [ChannelInfo] = []
    @Published var isLocked = false
    @Published var observedBitrateBps: Double = 0
    @Published var indicatedBitrateBps: Double = 0
    @Published var isFavorite: Bool = false

    // Error & retry
    @Published var playbackError: String?
    @Published var retryCount: Int = 0
    @Published var candidateCount: Int = 0
    @Published var currentCandidateIdx: Int = 0
    private var playbackCandidates: [PlaybackInfo] = []
    private var currentCandidateIndex: Int = 0

    // Diagnostics
    @Published var showDiagnostics = false
    @Published var showChannelList = false
    @Published var vlcState: String = "idle"

    lazy var streamPlayer: StreamPlayer = {
        let player = StreamPlayer()
        player.onBufferingStarted = { [weak self] in
            self?.recordStallEvent()
        }
        player.onPlaybackResumed = { [weak self] in
            self?.clearStallTracking()
        }
        return player
    }()

    private var bitrateTask: Task<Void, Never>?

    func play(channel: ChannelInfo, allChannels: [ChannelInfo]? = nil) {
        currentChannel = channel
        isPlaying = true
        isFullScreen = true
        isFavorite = channel.isFavorite
        channelList = allChannels ?? (channelList.isEmpty ? [channel] : channelList)
        playbackError = nil
        retryCount = 0
        currentCandidateIndex = 0
        playbackCandidates = []
        resetStallTracking()
        streamPlayer.play(streamUrl: channel.streamUrl)
        startBitrateObservation()
        Task {
            try? await RustBridge.shared.markRecentWatched(channelId: channel.id)
            try? await RustBridge.shared.setSetting(key: "player.lastChannelId", value: "\(channel.id)")
            await loadEpg(channelId: channel.id)
            await loadPlaybackCandidates(channelId: channel.id)
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
        isVideoLandscape = false
        isFavorite = false
        playbackError = nil
        retryCount = 0
        showDiagnostics = false
        showChannelList = false
        resetStallTracking()
    }

    func retryPlayback() {
        guard let channel = currentChannel else { return }
        retryCount += 1
        playbackError = nil

        // Try next candidate if available
        if !playbackCandidates.isEmpty {
            currentCandidateIndex = (currentCandidateIndex + 1) % playbackCandidates.count
            currentCandidateIdx = currentCandidateIndex
            let candidate = playbackCandidates[currentCandidateIndex]
            streamPlayer.play(streamUrl: candidate.streamUrl)
        } else {
            streamPlayer.play(streamUrl: channel.streamUrl)
        }
        startBitrateObservation()
    }

    /// Manual source switch: cycle to the next candidate
    func switchSource() {
        guard playbackCandidates.count > 1 else { return }
        currentCandidateIndex = (currentCandidateIndex + 1) % playbackCandidates.count
        currentCandidateIdx = currentCandidateIndex
        let candidate = playbackCandidates[currentCandidateIndex]
        retryCount = 0
        playbackError = nil
        resetStallTracking()
        streamPlayer.play(streamUrl: candidate.streamUrl)
        startBitrateObservation()
    }

    private func loadPlaybackCandidates(channelId: Int64) async {
        do {
            playbackCandidates = try await RustBridge.shared.listPlaybackCandidates(channelId: channelId)
            candidateCount = playbackCandidates.count
            currentCandidateIdx = 0
        } catch {
            playbackCandidates = []
            candidateCount = 0
        }
    }

    private func startBitrateObservation() {
        bitrateTask?.cancel()
        bitrateTask = Task { [weak self] in
            guard let self else { return }
            let stream = AsyncStream<Void> { continuation in
                let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
                    continuation.yield()
                }
                continuation.onTermination = { @Sendable _ in timer.invalidate() }
            }
            for await _ in stream {
                guard !Task.isCancelled else { break }
                self.observedBitrateBps = self.streamPlayer.observedBitrateBps
                self.indicatedBitrateBps = self.streamPlayer.indicatedBitrateBps
                self.vlcState = self.streamPlayer.stateDescription
            }
        }
    }

    func currentChannelIndex() -> Int? {
        guard let current = currentChannel else { return nil }
        return channelList.firstIndex(where: { $0.id == current.id })
    }

    func canGoToNextChannel() -> Bool {
        guard let index = currentChannelIndex() else { return false }
        return index + 1 < channelList.count
    }

    func canGoToPreviousChannel() -> Bool {
        guard let index = currentChannelIndex() else { return false }
        return index > 0
    }

    func nextChannel() {
        guard let index = currentChannelIndex(),
              index + 1 < channelList.count else { return }
        play(channel: channelList[index + 1])
    }

    func previousChannel() {
        guard let index = currentChannelIndex(), index > 0 else { return }
        play(channel: channelList[index - 1])
    }

    // MARK: - Favorites

    func toggleFavorite() {
        guard let channel = currentChannel else { return }
        let newValue = !isFavorite
        isFavorite = newValue
        // Update the channel in channelList as well
        if let idx = channelList.firstIndex(where: { $0.id == channel.id }) {
            channelList[idx].isFavorite = newValue
        }
        Task {
            do {
                try await RustBridge.shared.setFavorite(channelId: channel.id, favorite: newValue)
            } catch {
                // Revert on failure
                isFavorite = !newValue
                if let idx = channelList.firstIndex(where: { $0.id == channel.id }) {
                    channelList[idx].isFavorite = !newValue
                }
            }
        }
    }

    // MARK: - Stall Detection & Auto Source Switching

    private static let stallThreshold = 3
    private static let stallWindowMs: Int64 = 60_000
    private static let switchCooldownMs: Int64 = 30_000

    private var stallTimestamps: [Int64] = []
    private var lastAutoSwitchTime: Int64 = 0

    private func currentTimeMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }

    func resetStallTracking() {
        stallTimestamps.removeAll()
    }

    /// Called when VLC enters buffering state — records a stall event
    /// and auto-switches source if stalls are too frequent.
    func recordStallEvent() {
        let now = currentTimeMs()

        // Remove timestamps older than the stall window
        stallTimestamps.removeAll { now - $0 > Self.stallWindowMs }
        stallTimestamps.append(now)

        guard stallTimestamps.count >= Self.stallThreshold else { return }

        // Check cooldown
        guard now - lastAutoSwitchTime > Self.switchCooldownMs else { return }

        // Auto-switch to next candidate
        guard !playbackCandidates.isEmpty else { return }
        lastAutoSwitchTime = now
        stallTimestamps.removeAll()

        currentCandidateIndex = (currentCandidateIndex + 1) % playbackCandidates.count
        currentCandidateIdx = currentCandidateIndex
        let candidate = playbackCandidates[currentCandidateIndex]
        retryCount += 1
        streamPlayer.play(streamUrl: candidate.streamUrl)
    }

    /// Called when VLC returns to playing state — clear stall tracking.
    func clearStallTracking() {
        stallTimestamps.removeAll()
    }

    private func loadEpg(channelId: Int64) async {
        do {
            let programs = try await RustBridge.shared.fetchChannelEpg(channelId: channelId, from: nil, to: nil)
            epgSnapshot = EpgDesktopParity.channelEpgSnapshot(channelId: channelId, programs: programs)
        } catch {
            epgSnapshot = nil
        }
    }
}
