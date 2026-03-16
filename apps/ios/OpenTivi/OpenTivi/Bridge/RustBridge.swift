import Foundation

/// Singleton wrapper around UniFFI-generated Rust bindings.
/// All methods dispatch to background threads to avoid blocking the main thread.
/// Stub methods use an in-memory store until UniFFI bindings are wired up.
@MainActor
final class RustBridge: ObservableObject {
    static let shared = RustBridge()
    private(set) var proxyPort: UInt16 = 0
    @Published private(set) var isInitialized = false

    // MARK: - In-memory stub store (remove when UniFFI is wired up)
    private var stubSources: [SourceInfo] = []
    private var stubNextId: Int64 = 1
    private var stubSettings: [String: String] = [:]

    private init() {}

    func initialize(dataDir: String) {
        guard !isInitialized else { return }
        do {
            // TODO: Call UniFFI-generated initEngine(dataDir:)
            // proxyPort = try initEngine(dataDir: dataDir)
            proxyPort = 0
            isInitialized = true
        } catch {
            print("Failed to initialize Rust engine: \(error)")
        }
    }

    func initializeAsync() async {
        guard !isInitialized else { return }
        let appSupportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)

        let port: UInt16 = await Task.detached(priority: .userInitiated) {
            // TODO: return try initEngine(dataDir: dataDir)
            return UInt16(0)
        }.value

        proxyPort = port
        isInitialized = true
    }

    // MARK: - Sources

    func fetchSources() async throws -> [SourceInfo] {
        // TODO: return try listSources()
        return stubSources
    }

    func importM3u(name: String, location: String, autoRefreshMinutes: UInt32? = nil) async throws -> ImportResult {
        // TODO: return try importM3u(name: name, location: location, autoRefreshMinutes: autoRefreshMinutes)
        let now = ISO8601DateFormatter().string(from: Date())
        let id = stubNextId
        stubNextId += 1
        let source = SourceInfo(
            id: id, kind: "m3u", name: name, location: location,
            username: nil, password: nil, enabled: true, disabledReason: nil,
            autoRefreshMinutes: autoRefreshMinutes, channelCount: 0, groupCount: 0,
            channelsWithTvgId: 0, epgProgramCount: 0, lastImportedAt: now,
            lastRefreshError: nil, lastRefreshAttemptAt: nil,
            consecutiveRefreshFailures: 0, nextRetryAt: nil,
            createdAt: now, updatedAt: now
        )
        stubSources.append(source)
        return ImportResult(sourceId: id, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0)
    }

    func importXtream(name: String, serverUrl: String, username: String, password: String) async throws -> ImportResult {
        // TODO: return try importXtream(name: name, serverUrl: serverUrl, username: username, password: password)
        let now = ISO8601DateFormatter().string(from: Date())
        let id = stubNextId
        stubNextId += 1
        let source = SourceInfo(
            id: id, kind: "xtream", name: name, location: serverUrl,
            username: username, password: password, enabled: true, disabledReason: nil,
            autoRefreshMinutes: nil, channelCount: 0, groupCount: 0,
            channelsWithTvgId: 0, epgProgramCount: 0, lastImportedAt: now,
            lastRefreshError: nil, lastRefreshAttemptAt: nil,
            consecutiveRefreshFailures: 0, nextRetryAt: nil,
            createdAt: now, updatedAt: now
        )
        stubSources.append(source)
        return ImportResult(sourceId: id, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0)
    }

    func importXmltv(name: String, location: String) async throws -> ImportResult {
        // TODO: return try importXmltv(name: name, location: location)
        let now = ISO8601DateFormatter().string(from: Date())
        let id = stubNextId
        stubNextId += 1
        let source = SourceInfo(
            id: id, kind: "xmltv", name: name, location: location,
            username: nil, password: nil, enabled: true, disabledReason: nil,
            autoRefreshMinutes: nil, channelCount: 0, groupCount: 0,
            channelsWithTvgId: 0, epgProgramCount: 0, lastImportedAt: now,
            lastRefreshError: nil, lastRefreshAttemptAt: nil,
            consecutiveRefreshFailures: 0, nextRetryAt: nil,
            createdAt: now, updatedAt: now
        )
        stubSources.append(source)
        return ImportResult(sourceId: id, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0)
    }

    func refreshSource(sourceId: Int64) async throws -> ImportResult {
        // TODO: return try refreshSource(sourceId: sourceId)
        return ImportResult(sourceId: sourceId, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0)
    }

    func deleteSource(sourceId: Int64) async throws {
        // TODO: try deleteSource(sourceId: sourceId)
        stubSources.removeAll { $0.id == sourceId }
    }

    // MARK: - Channels

    func fetchChannels(sourceId: Int64? = nil, group: String? = nil, search: String? = nil, favoritesOnly: Bool? = nil, limit: UInt32 = 500, offset: UInt32 = 0) async throws -> [ChannelInfo] {
        // TODO: return try listChannels(sourceId: sourceId, groupName: group, search: search, favoritesOnly: favoritesOnly, limit: limit, offset: offset)
        return []
    }

    func fetchGroups(sourceId: Int64? = nil) async throws -> [String] {
        // TODO: return try listGroups(sourceId: sourceId)
        return []
    }

    func fetchChannel(channelId: Int64) async throws -> ChannelInfo? {
        // TODO: return try getChannel(channelId: channelId)
        return nil
    }

    // MARK: - EPG

    func fetchChannelEpg(channelId: Int64, from: String? = nil, to: String? = nil) async throws -> [EpgProgramInfo] {
        // TODO: return try getChannelEpg(channelId: channelId, fromTs: from, toTs: to)
        return []
    }

    func fetchEpgSnapshots(channelIds: [Int64], windowStart: Int64? = nil, windowEnd: Int64? = nil) async throws -> [ChannelEpgSnapshot] {
        // TODO: return try getChannelsEpgSnapshots(channelIds: channelIds, windowStartTs: windowStart, windowEndTs: windowEnd)
        return []
    }

    // MARK: - Favorites

    func fetchFavorites() async throws -> [ChannelInfo] {
        // TODO: return try listFavorites()
        return []
    }

    func setFavorite(channelId: Int64, favorite: Bool) async throws {
        // TODO: try setFavorite(channelId: channelId, favorite: favorite)
    }

    // MARK: - Recents

    func fetchRecents() async throws -> [RecentChannelInfo] {
        // TODO: return try listRecents()
        return []
    }

    func markRecentWatched(channelId: Int64) async throws {
        // TODO: try markRecentWatched(channelId: channelId)
    }

    // MARK: - Playback

    func resolvePlayback(channelId: Int64) async throws -> PlaybackInfo {
        // TODO: return try resolvePlayback(channelId: channelId)
        return PlaybackInfo(channelId: channelId, resolvedChannelId: channelId, sourceId: 0, channelName: "", streamUrl: "", logoUrl: nil)
    }

    // MARK: - Settings

    func fetchSettings() async throws -> [SettingInfo] {
        // TODO: return try getAllSettings()
        let now = ISO8601DateFormatter().string(from: Date())
        return stubSettings.map { SettingInfo(key: $0.key, value: $0.value, updatedAt: now) }
    }

    func setSetting(key: String, value: String) async throws {
        // TODO: try setSetting(key: key, value: value)
        stubSettings[key] = value
    }
}

// Type definitions are in Models/Models.swift
// They will be replaced by UniFFI-generated types when the Swift bindings are generated.
