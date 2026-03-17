import Foundation

/// Singleton wrapper around UniFFI-generated Rust bindings.
/// All methods dispatch to background threads to avoid blocking the main thread.
@MainActor
final class RustBridge: ObservableObject {
    static let shared = RustBridge()
    private(set) var proxyPort: UInt16 = 0
    @Published private(set) var isInitialized = false

    private init() {}

    func initialize(dataDir: String) {
        guard !isInitialized else { return }
        do {
            proxyPort = try initEngine(dataDir: dataDir)
            isInitialized = true
        } catch {
            print("Failed to initialize Rust engine: \(error)")
        }
    }

    func initializeAsync() async {
        guard !isInitialized else { return }
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)

        let dataDir = appSupportDir.path
        let port: UInt16 = await Task.detached(priority: .userInitiated) {
            return try initEngine(dataDir: dataDir)
        }.value

        proxyPort = port
        isInitialized = true
    }

    // MARK: - Sources

    func fetchSources() async throws -> [SourceInfo] {
        return try listSources()
    }

    func importM3u(name: String, location: String, autoRefreshMinutes: UInt32? = nil) async throws -> ImportResult {
        return try OpenTivi.importM3u(name: name, location: location, autoRefreshMinutes: autoRefreshMinutes)
    }

    func importXtream(name: String, serverUrl: String, username: String, password: String) async throws -> ImportResult {
        return try OpenTivi.importXtream(name: name, serverUrl: serverUrl, username: username, password: password)
    }

    func importXmltv(name: String, location: String) async throws -> ImportResult {
        return try OpenTivi.importXmltv(name: name, location: location)
    }

    func refreshSource(sourceId: Int64) async throws -> ImportResult {
        return try OpenTivi.refreshSource(sourceId: sourceId)
    }

    func updateSource(sourceId: Int64, name: String, location: String, username: String? = nil, password: String? = nil, autoRefreshMinutes: UInt32? = nil, enabled: Bool = true) async throws {
        try OpenTivi.updateSource(sourceId: sourceId, name: name, location: location, username: username, password: password, autoRefreshMinutes: autoRefreshMinutes, enabled: enabled)
    }

    func deleteSource(sourceId: Int64) async throws {
        try OpenTivi.deleteSource(sourceId: sourceId)
    }

    // MARK: - Channels

    func fetchChannels(sourceId: Int64? = nil, group: String? = nil, search: String? = nil, favoritesOnly: Bool? = nil, limit: UInt32 = 500, offset: UInt32 = 0) async throws -> [ChannelInfo] {
        return try listChannels(sourceId: sourceId, groupName: group, search: search, favoritesOnly: favoritesOnly, limit: limit, offset: offset)
    }

    func fetchGroups(sourceId: Int64? = nil) async throws -> [String] {
        return try listGroups(sourceId: sourceId)
    }

    func fetchChannel(channelId: Int64) async throws -> ChannelInfo? {
        return try getChannel(channelId: channelId)
    }

    // MARK: - EPG

    func fetchChannelEpg(channelId: Int64, from: String? = nil, to: String? = nil) async throws -> [EpgProgramInfo] {
        return try getChannelEpg(channelId: channelId, fromTs: from, toTs: to)
    }

    func fetchEpgSnapshots(channelIds: [Int64], windowStart: Int64? = nil, windowEnd: Int64? = nil) async throws -> [ChannelEpgSnapshot] {
        return try getChannelsEpgSnapshots(channelIds: channelIds, windowStartTs: windowStart, windowEndTs: windowEnd)
    }

    // MARK: - Favorites

    func fetchFavorites() async throws -> [ChannelInfo] {
        return try listFavorites()
    }

    func setFavorite(channelId: Int64, favorite: Bool) async throws {
        try OpenTivi.setFavorite(channelId: channelId, favorite: favorite)
    }

    // MARK: - Recents

    func fetchRecents() async throws -> [RecentChannelInfo] {
        return try listRecents()
    }

    func markRecentWatched(channelId: Int64) async throws {
        try OpenTivi.markRecentWatched(channelId: channelId)
    }

    // MARK: - Playback

    func resolvePlayback(channelId: Int64) async throws -> PlaybackInfo {
        return try OpenTivi.resolvePlayback(channelId: channelId)
    }

    // MARK: - Settings

    func fetchSettings() async throws -> [SettingInfo] {
        return try getAllSettings()
    }

    func setSetting(key: String, value: String) async throws {
        try OpenTivi.setSetting(key: key, value: value)
    }
}
