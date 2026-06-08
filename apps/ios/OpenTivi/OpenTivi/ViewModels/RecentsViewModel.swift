import SwiftUI

@MainActor
final class RecentsViewModel: ObservableObject {
    @Published var recents: [RecentChannelInfo] = []
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            recents = try await RustBridge.shared.fetchRecents()
        } catch {
            print("Load recents error: \(error)")
        }
    }
}
