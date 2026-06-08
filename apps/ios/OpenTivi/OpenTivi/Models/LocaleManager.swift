import SwiftUI

@MainActor
final class LocaleManager: ObservableObject {
    static let shared = LocaleManager()

    @Published private(set) var currentLocale: String
    private var translations: [String: String] = [:]

    private init() {
        let preferred = Locale.preferredLanguages.first ?? "en"
        if preferred.hasPrefix("zh") {
            currentLocale = "zh-CN"
        } else {
            currentLocale = "en-US"
        }
        loadTranslations()
    }

    func setLocale(_ locale: String) {
        guard locale != currentLocale else { return }
        currentLocale = locale
        loadTranslations()
    }

    func t(_ key: String) -> String {
        translations[key] ?? key
    }

    func t(_ key: String, _ args: [String: String]) -> String {
        var result = translations[key] ?? key
        for (placeholder, value) in args {
            result = result.replacingOccurrences(of: "{\(placeholder)}", with: value)
        }
        return result
    }

    private func loadTranslations() {
        let fileName = currentLocale == "zh-CN" ? "zh-CN" : "en-US"
        guard let url = Bundle.main.url(forResource: fileName, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let dict = try? JSONDecoder().decode([String: String].self, from: data) else {
            print("Failed to load locale file: \(fileName).json")
            return
        }
        translations = dict
    }
}
