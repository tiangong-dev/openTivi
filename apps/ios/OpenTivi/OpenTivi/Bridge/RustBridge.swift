import Foundation
import OSLog

/// Singleton wrapper around UniFFI-generated Rust bindings.
/// All methods dispatch to background threads to avoid blocking the main thread.
@MainActor
final class RustBridge: ObservableObject {
    static let shared = RustBridge()
    private static let logger = Logger(subsystem: "com.opentivi.ios", category: "Startup")
    @Published private(set) var isInitialized = false

    private init() {}

    static func logStartup(_ message: String, since start: TimeInterval? = nil) {
        if let start {
            let elapsedMs = (ProcessInfo.processInfo.systemUptime - start) * 1000
            logger.log("\(message, privacy: .public) | elapsed=\(elapsedMs, format: .fixed(precision: 1))ms")
        } else {
            logger.log("\(message, privacy: .public)")
        }
    }

    private func logInit(_ message: String, since start: TimeInterval) {
        Self.logStartup("Bridge init: \(message)", since: start)
    }

    func initialize(dataDir: String) {
        guard !isInitialized else { return }
        do {
            try OpenTivi.initEngine(dataDir: dataDir)
            isInitialized = true
        } catch {
            print("Failed to initialize Rust engine: \(error)")
        }
    }

    func initializeAsync() async {
        guard !isInitialized else {
            Self.logStartup("Bridge init skipped because engine is already initialized")
            return
        }
        let start = ProcessInfo.processInfo.systemUptime
        Self.logStartup("Bridge init requested on main actor")
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        Self.logStartup("Resolved Application Support directory: \(appSupportDir.path)")
        do {
            try FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
            logInit("Application Support directory is ready", since: start)
        } catch {
            logInit("Failed to create Application Support directory: \(error.localizedDescription)", since: start)
        }

        let dataDir = appSupportDir.path
        do {
            logInit("Dispatching OpenTivi.initEngine(dataDir:) to background task", since: start)
            try await Task.detached(priority: .userInitiated) {
                try OpenTivi.initEngine(dataDir: dataDir)
            }.value

            isInitialized = true
            logInit("OpenTivi.initEngine completed", since: start)
        } catch {
            logInit("OpenTivi.initEngine failed: \(error.localizedDescription)", since: start)
        }
    }

    // MARK: - Sources

    func fetchSources() async throws -> [SourceInfo] {
        try await Task.detached { try OpenTivi.listSources() }.value
    }

    func importM3u(name: String, location: String, autoRefreshMinutes: UInt32? = nil) async throws -> ImportResult {
        try await Task.detached { try OpenTivi.importM3u(name: name, location: location, autoRefreshMinutes: autoRefreshMinutes) }.value
    }

    func importXtream(name: String, serverUrl: String, username: String, password: String) async throws -> ImportResult {
        try await Task.detached { try OpenTivi.importXtream(name: name, serverUrl: serverUrl, username: username, password: password) }.value
    }

    func importXmltv(name: String, location: String) async throws -> ImportResult {
        try await Task.detached { try OpenTivi.importXmltv(name: name, location: location) }.value
    }

    func refreshSource(sourceId: Int64) async throws -> ImportResult {
        try await Task.detached { try OpenTivi.refreshSource(sourceId: sourceId) }.value
    }

    func updateSource(
        sourceId: Int64,
        name: String,
        location: String,
        username: String? = nil,
        password: String? = nil,
        autoRefreshMinutes: UInt32? = nil,
        enabled: Bool = true
    ) async throws {
        try await Task.detached {
            try OpenTivi.updateSource(
                sourceId: sourceId,
                name: name,
                location: location,
                username: username,
                password: password,
                autoRefreshMinutes: autoRefreshMinutes,
                enabled: enabled
            )
        }.value
    }

    func deleteSource(sourceId: Int64) async throws {
        try await Task.detached { try OpenTivi.deleteSource(sourceId: sourceId) }.value
    }

    // MARK: - Channels

    func fetchChannels(
        sourceId: Int64? = nil,
        group: String? = nil,
        search: String? = nil,
        favoritesOnly: Bool? = nil,
        limit: UInt32 = 500,
        offset: UInt32 = 0
    ) async throws -> [ChannelInfo] {
        let start = ProcessInfo.processInfo.systemUptime
        Self.logStartup(
            "fetchChannels start sourceId=\(String(describing: sourceId)) group=\(String(describing: group)) search=\(String(describing: search)) favoritesOnly=\(String(describing: favoritesOnly)) limit=\(limit) offset=\(offset)"
        )
        let channels = try await Task.detached {
            try OpenTivi.listChannels(
                sourceId: sourceId,
                groupName: group,
                search: search,
                favoritesOnly: favoritesOnly,
                limit: limit,
                offset: offset
            )
        }.value
        Self.logStartup("fetchChannels finished count=\(channels.count)", since: start)
        return channels
    }

    func fetchGroups(sourceId: Int64? = nil) async throws -> [String] {
        let start = ProcessInfo.processInfo.systemUptime
        Self.logStartup("fetchGroups start sourceId=\(String(describing: sourceId))")
        let groups = try await Task.detached { try OpenTivi.listGroups(sourceId: sourceId) }.value
        Self.logStartup("fetchGroups finished count=\(groups.count)", since: start)
        return groups
    }

    func fetchChannel(channelId: Int64) async throws -> ChannelInfo? {
        try await Task.detached { try OpenTivi.getChannel(channelId: channelId) }.value
    }

    // MARK: - EPG

    func fetchChannelEpg(channelId: Int64, from: String? = nil, to: String? = nil) async throws -> [EpgProgramInfo] {
        try await Task.detached { try OpenTivi.getChannelEpg(channelId: channelId, fromTs: from, toTs: to) }.value
    }

    func fetchEpgSnapshots(channelIds: [Int64], windowStart: Int64? = nil, windowEnd: Int64? = nil) async throws -> [ChannelEpgSnapshot] {
        try await Task.detached {
            try OpenTivi.getChannelsEpgSnapshots(channelIds: channelIds, windowStartTs: windowStart, windowEndTs: windowEnd)
        }.value
    }

    // MARK: - Favorites

    func fetchFavorites() async throws -> [ChannelInfo] {
        try await Task.detached { try OpenTivi.listFavorites() }.value
    }

    func setFavorite(channelId: Int64, favorite: Bool) async throws {
        try await Task.detached { try OpenTivi.setFavorite(channelId: channelId, favorite: favorite) }.value
    }

    // MARK: - Recents

    func fetchRecents() async throws -> [RecentChannelInfo] {
        try await Task.detached { try OpenTivi.listRecents() }.value
    }

    func markRecentWatched(channelId: Int64) async throws {
        try await Task.detached { try OpenTivi.markRecentWatched(channelId: channelId) }.value
    }

    // MARK: - EPG Search

    func searchEpg(search: String?, state: String? = nil, limit: UInt32? = nil) async throws -> [EpgSearchResult] {
        try await Task.detached { try OpenTivi.searchEpg(search: search, state: state, limit: limit) }.value
    }

    // MARK: - Playback

    func resolvePlayback(channelId: Int64) async throws -> PlaybackInfo {
        try await Task.detached { try OpenTivi.resolvePlayback(channelId: channelId) }.value
    }

    func listPlaybackCandidates(channelId: Int64) async throws -> [PlaybackInfo] {
        try await Task.detached { try OpenTivi.listPlaybackCandidates(channelId: channelId) }.value
    }

    // MARK: - Settings

    func fetchSettings() async throws -> [SettingInfo] {
        try await Task.detached { try OpenTivi.getAllSettings() }.value
    }

    func setSetting(key: String, value: String) async throws {
        try await Task.detached { try OpenTivi.setSetting(key: key, value: value) }.value
    }
}
