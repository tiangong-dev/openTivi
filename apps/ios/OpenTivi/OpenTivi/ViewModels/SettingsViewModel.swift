import SwiftUI

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var settings: [SettingInfo] = []
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            settings = try await RustBridge.shared.fetchSettings()
        } catch {
            print("Load settings error: \(error)")
        }
    }

    func setSetting(key: String, value: String) async {
        do {
            try await RustBridge.shared.setSetting(key: key, value: value)
            await load()
        } catch {
            print("Set setting error: \(error)")
        }
    }
}
