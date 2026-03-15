import Foundation

// MARK: - UniFFI type placeholders
// These mirror the UniFFI-generated record types from opentivi.udl.
// Once the UniFFI Swift codegen is wired up, remove these and use the generated types directly.

struct SourceInfo: Identifiable, Hashable {
    let id: Int64
    let kind: String
    let name: String
    let location: String
    let username: String?
    let password: String?
    let enabled: Bool
    let disabledReason: String?
    let autoRefreshMinutes: UInt32?
    let channelCount: UInt32
    let groupCount: UInt32
    let channelsWithTvgId: UInt32
    let epgProgramCount: UInt32
    let lastImportedAt: String?
    let lastRefreshError: String?
    let lastRefreshAttemptAt: String?
    let consecutiveRefreshFailures: UInt32
    let nextRetryAt: String?
    let createdAt: String
    let updatedAt: String
}

struct ChannelInfo: Identifiable, Hashable {
    let id: Int64
    let sourceId: Int64
    let name: String
    let channelNumber: String?
    let groupName: String?
    let tvgId: String?
    let logoUrl: String?
    let streamUrl: String
    let isFavorite: Bool
}

struct EpgProgramInfo: Identifiable, Hashable {
    let id: Int64
    let channelTvgId: String
    let startAt: String
    let endAt: String
    let title: String
    let description: String?
    let category: String?
}

struct EpgProgramMini: Hashable {
    let title: String
    let startAt: String
    let endAt: String
}

struct ChannelEpgSnapshot: Hashable {
    let channelId: Int64
    let now: EpgProgramMini?
    let next: EpgProgramMini?
    let timelinePrograms: [EpgProgramMini]
}

struct ImportResult {
    let sourceId: Int64
    let channelsImported: UInt32
    let channelsUpdated: UInt32
    let channelsRemoved: UInt32
}

struct RecentChannelInfo: Identifiable, Hashable {
    let id: Int64
    let sourceId: Int64
    let name: String
    let channelNumber: String?
    let groupName: String?
    let tvgId: String?
    let logoUrl: String?
    let streamUrl: String
    let isFavorite: Bool
    let lastWatchedAt: String
    let playCount: Int64
}

struct SettingInfo: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let value: String
    let updatedAt: String
}

struct PlaybackInfo: Hashable {
    let channelId: Int64
    let resolvedChannelId: Int64
    let sourceId: Int64
    let channelName: String
    let streamUrl: String
    let logoUrl: String?
}

struct EpgSearchResult: Identifiable, Hashable {
    let id: Int64
    let channelId: Int64
    let sourceId: Int64
    let channelName: String
    let channelNumber: String?
    let channelTvgId: String
    let startAt: String
    let endAt: String
    let title: String
    let description: String?
    let category: String?
}
