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

    private let locale = LocaleManager.shared

    func importM3u(name: String, location: String, autoRefreshMinutes: UInt32?) async {
        do {
            let result = try await RustBridge.shared.importM3u(name: name, location: location, autoRefreshMinutes: autoRefreshMinutes)
            importMessage = locale.t("sources.message.imported", ["count": "\(result.channelsImported)"])
            await load()
        } catch {
            importMessage = locale.t("sources.message.importFailed", ["error": error.localizedDescription])
        }
    }

    func importXtream(name: String, serverUrl: String, username: String, password: String) async {
        do {
            let result = try await RustBridge.shared.importXtream(name: name, serverUrl: serverUrl, username: username, password: password)
            importMessage = locale.t("sources.message.imported", ["count": "\(result.channelsImported)"])
            await load()
        } catch {
            importMessage = locale.t("sources.message.importFailed", ["error": error.localizedDescription])
        }
    }

    func deleteSource(sourceId: Int64) async {
        do {
            try await RustBridge.shared.deleteSource(sourceId: sourceId)
            sources.removeAll { $0.id == sourceId }
        } catch {
            importMessage = locale.t("sources.message.deleteFailed", ["error": error.localizedDescription])
        }
    }

    func updateSource(sourceId: Int64, name: String, location: String, username: String?, password: String?, autoRefreshMinutes: UInt32?, enabled: Bool) async {
        do {
            try await RustBridge.shared.updateSource(
                sourceId: sourceId,
                name: name,
                location: location,
                username: username,
                password: password,
                autoRefreshMinutes: autoRefreshMinutes,
                enabled: enabled
            )
            importMessage = locale.t("sources.message.sourceUpdated")
            await load()
        } catch {
            importMessage = locale.t("sources.message.importFailed", ["error": error.localizedDescription])
        }
    }

    func importXmltv(name: String, location: String) async {
        do {
            let result = try await RustBridge.shared.importXmltv(name: name, location: location)
            importMessage = locale.t("sources.message.imported", ["count": "\(result.channelsImported)"])
            await load()
        } catch {
            importMessage = locale.t("sources.message.importFailed", ["error": error.localizedDescription])
        }
    }

    func refreshSource(sourceId: Int64) async {
        do {
            let result = try await RustBridge.shared.refreshSource(sourceId: sourceId)
            importMessage = locale.t("sources.message.refreshed", ["count": "\(result.channelsImported)"])
            await load()
        } catch {
            importMessage = locale.t("sources.message.refreshFailed", ["error": error.localizedDescription])
        }
    }

    func refreshAllSources() async {
        for source in sources {
            do {
                _ = try await RustBridge.shared.refreshSource(sourceId: source.id)
            } catch {
                print("Refresh source \(source.name) failed: \(error)")
            }
        }
        await load()
    }
}
