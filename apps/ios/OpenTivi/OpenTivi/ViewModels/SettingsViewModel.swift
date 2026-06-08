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

    func settingValue(for key: String) -> String? {
        guard let raw = settings.first(where: { $0.key == key })?.value else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count >= 2, trimmed.first == "\"", trimmed.last == "\"" {
            return String(trimmed.dropFirst().dropLast())
        }
        return trimmed
    }
}
