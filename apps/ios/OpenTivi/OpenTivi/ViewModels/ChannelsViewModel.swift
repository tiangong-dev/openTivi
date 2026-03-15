import SwiftUI

@MainActor
final class ChannelsViewModel: ObservableObject {
    @Published var channels: [ChannelInfo] = []
    @Published var groups: [String] = []
    @Published var selectedGroup: String?
    @Published var searchText = ""
    @Published var isLoading = false

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
        isLoading = true
        defer { isLoading = false }
        do {
            channels = try await RustBridge.shared.fetchChannels()
        } catch {
            print("Load channels error: \(error)")
        }
    }

    func loadGroups() async {
        do {
            groups = try await RustBridge.shared.fetchGroups()
        } catch {
            print("Load groups error: \(error)")
        }
    }

    func toggleFavorite(channelId: Int64) {
        guard let index = channels.firstIndex(where: { $0.id == channelId }) else { return }
        let newValue = !channels[index].isFavorite
        channels[index].isFavorite = newValue
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
        Task {
            try? await RustBridge.shared.setFavorite(channelId: channelId, favorite: newValue)
        }
    }
}
