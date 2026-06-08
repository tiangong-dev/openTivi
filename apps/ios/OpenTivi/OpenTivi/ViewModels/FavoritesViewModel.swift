import SwiftUI

@MainActor
final class FavoritesViewModel: ObservableObject {
    @Published var favorites: [ChannelInfo] = []
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            favorites = try await RustBridge.shared.fetchFavorites()
        } catch {
            print("Load favorites error: \(error)")
        }
    }

    func removeFavorite(channelId: Int64) async {
        do {
            try await RustBridge.shared.setFavorite(channelId: channelId, favorite: false)
            favorites.removeAll { $0.id == channelId }
        } catch {
            print("Remove favorite error: \(error)")
        }
    }
}
