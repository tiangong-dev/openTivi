import SwiftUI

@MainActor
final class SourcesViewModel: ObservableObject {
    @Published var sources: [SourceInfo] = []
    @Published var isLoading = false
    @Published var importMessage: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            sources = try await RustBridge.shared.fetchSources()
        } catch {
            print("Load sources error: \(error)")
        }
    }

    func importM3u(name: String, location: String, autoRefreshMinutes: UInt32?) async {
        do {
            let result = try await RustBridge.shared.importM3u(name: name, location: location, autoRefreshMinutes: autoRefreshMinutes)
            importMessage = "Imported \(result.channelsImported) channels"
            await load()
        } catch {
            importMessage = "Import failed: \(error.localizedDescription)"
        }
    }

    func importXtream(name: String, serverUrl: String, username: String, password: String) async {
        do {
            let result = try await RustBridge.shared.importXtream(name: name, serverUrl: serverUrl, username: username, password: password)
            importMessage = "Imported \(result.channelsImported) channels"
            await load()
        } catch {
            importMessage = "Import failed: \(error.localizedDescription)"
        }
    }

    func deleteSource(sourceId: Int64) async {
        do {
            try await RustBridge.shared.deleteSource(sourceId: sourceId)
            sources.removeAll { $0.id == sourceId }
        } catch {
            importMessage = "Delete failed: \(error.localizedDescription)"
        }
    }

    func refreshSource(sourceId: Int64) async {
        do {
            let result = try await RustBridge.shared.refreshSource(sourceId: sourceId)
            importMessage = "Refreshed: +\(result.channelsImported) channels"
            await load()
        } catch {
            importMessage = "Refresh failed: \(error.localizedDescription)"
        }
    }
}
