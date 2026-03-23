import SwiftUI

@MainActor
final class ChannelsViewModel: ObservableObject {
    @Published var channels: [ChannelInfo] = []
    @Published var groups: [String] = []
    @Published var selectedGroup: String?
    @Published var searchText = ""
    @Published var isLoading = false
    private let startupUptime = ProcessInfo.processInfo.systemUptime

    var filteredChannels: [ChannelInfo] {
        var result = channels
        if let group = selectedGroup {
            result = result.filter { $0.groupName == group }
        }
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            result = result.filter { $0.name.lowercased().contains(query) }
        }
        return result
    }

    func loadChannels() async {
        let start = ProcessInfo.processInfo.systemUptime
        RustBridge.logStartup("ChannelsViewModel.loadChannels start", since: startupUptime)
        isLoading = true
        defer {
            isLoading = false
            RustBridge.logStartup("ChannelsViewModel.loadChannels end", since: start)
        }
        do {
            channels = try await RustBridge.shared.fetchChannels()
            RustBridge.logStartup("ChannelsViewModel.loadChannels success count=\(channels.count)", since: start)
        } catch {
            RustBridge.logStartup("ChannelsViewModel.loadChannels failed: \(error.localizedDescription)", since: start)
        }
    }

    func loadGroups() async {
        let start = ProcessInfo.processInfo.systemUptime
        RustBridge.logStartup("ChannelsViewModel.loadGroups start", since: startupUptime)
        do {
            groups = try await RustBridge.shared.fetchGroups()
            RustBridge.logStartup("ChannelsViewModel.loadGroups success count=\(groups.count)", since: start)
        } catch {
            RustBridge.logStartup("ChannelsViewModel.loadGroups failed: \(error.localizedDescription)", since: start)
        }
    }

    func toggleFavorite(channelId: Int64) {
        guard let index = channels.firstIndex(where: { $0.id == channelId }) else { return }
        let newValue = !channels[index].isFavorite
        channels[index].isFavorite = newValue
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
        Task {
            do {
                try await RustBridge.shared.setFavorite(channelId: channelId, favorite: newValue)
            } catch {
                if let idx = channels.firstIndex(where: { $0.id == channelId }) {
                    channels[idx].isFavorite = !newValue
                }
            }
        }
    }
}
