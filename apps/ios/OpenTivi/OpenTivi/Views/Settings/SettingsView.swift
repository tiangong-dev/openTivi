import SwiftUI

struct SettingsView: View {
    @StateObject private var vm = SettingsViewModel()
    @ObservedObject private var locale = LocaleManager.shared

    private var startViewValue: String {
        vm.settingValue(for: "app.startView") ?? "channels"
    }

    private var guideWindowValue: Int {
        if let raw = vm.settingValue(for: "epg.guideWindowMinutes"), let val = Int(raw) { return val }
        return 180
    }

    var body: some View {
        Form {
            // MARK: General
            Section(locale.t("settings.category.general")) {
                NavigationLink {
                    languagePickerView
                } label: {
                    LabeledContent(locale.t("settings.locale.label"), value: locale.currentLocale == "zh-CN" ? "中文" : "English")
                }

                NavigationLink {
                    startViewPickerView
                } label: {
                    LabeledContent(locale.t("settings.startView.label"), value: startViewDisplayName(startViewValue))
                }
            }

            // MARK: Playback
            Section(locale.t("settings.category.playback")) {
                Toggle(locale.t("settings.player.preferNativeHls"), isOn: Binding(
                    get: { vm.settingValue(for: "player.preferNativeHls") == "true" },
                    set: { newVal in
                        Task { await vm.setSetting(key: "player.preferNativeHls", value: newVal ? "true" : "false") }
                    }
                ))
            }

            // MARK: EPG
            Section(locale.t("settings.category.epg")) {
                NavigationLink {
                    guideWindowPickerView
                } label: {
                    LabeledContent(
                        locale.t("settings.epg.guideTimelineWindow"),
                        value: locale.t("settings.option.minutes", ["minutes": "\(guideWindowValue)"])
                    )
                }
            }

            // MARK: About
            Section(locale.t("settings.about")) {
                LabeledContent(locale.t("settings.version"), value: "0.1.0")
                LabeledContent(locale.t("settings.build"), value: "1")
                Link("GitHub", destination: URL(string: "https://github.com/tiangong-dev/opentivi")!)
            }
        }
        .contentMargins(.bottom, 100, for: .scrollContent)
        .navigationTitle(locale.t("nav.settings"))
        .task { await vm.load() }
    }

    // MARK: - Language Picker

    private var languagePickerView: some View {
        List {
            Button {
                locale.setLocale("en-US")
                Task { await vm.setSetting(key: "ui.locale", value: "\"en-US\"") }
            } label: {
                HStack {
                    Text("English")
                    Spacer()
                    if locale.currentLocale == "en-US" {
                        Image(systemName: "checkmark")
                            .foregroundColor(.tiviPrimary)
                    }
                }
            }
            Button {
                locale.setLocale("zh-CN")
                Task { await vm.setSetting(key: "ui.locale", value: "\"zh-CN\"") }
            } label: {
                HStack {
                    Text("中文")
                    Spacer()
                    if locale.currentLocale == "zh-CN" {
                        Image(systemName: "checkmark")
                            .foregroundColor(.tiviPrimary)
                    }
                }
            }
        }
        .navigationTitle(locale.t("settings.locale.label"))
    }

    // MARK: - Start View Picker

    private var startViewPickerView: some View {
        let options: [(key: String, labelKey: String)] = [
            ("channels", "settings.startView.channels"),
            ("favorites", "settings.startView.favorites"),
            ("recents", "settings.startView.recents"),
            ("sources", "settings.startView.sources"),
        ]
        return List {
            ForEach(options, id: \.key) { option in
                Button {
                    Task { await vm.setSetting(key: "app.startView", value: option.key) }
                } label: {
                    HStack {
                        Text(locale.t(option.labelKey))
                        Spacer()
                        if startViewValue == option.key {
                            Image(systemName: "checkmark")
                                .foregroundColor(.tiviPrimary)
                        }
                    }
                }
            }
        }
        .navigationTitle(locale.t("settings.startView.label"))
    }

    // MARK: - Guide Window Picker

    private var guideWindowPickerView: some View {
        let options = [60, 90, 120, 150, 180, 240, 300, 360]
        return List {
            ForEach(options, id: \.self) { minutes in
                Button {
                    Task { await vm.setSetting(key: "epg.guideWindowMinutes", value: "\(minutes)") }
                } label: {
                    HStack {
                        Text(locale.t("settings.option.minutes", ["minutes": "\(minutes)"]))
                        Spacer()
                        if guideWindowValue == minutes {
                            Image(systemName: "checkmark")
                                .foregroundColor(.tiviPrimary)
                        }
                    }
                }
            }
        }
        .navigationTitle(locale.t("settings.epg.guideTimelineWindow"))
    }

    private func startViewDisplayName(_ value: String) -> String {
        switch value {
        case "channels": return locale.t("settings.startView.channels")
        case "favorites": return locale.t("settings.startView.favorites")
        case "recents": return locale.t("settings.startView.recents")
        case "sources": return locale.t("settings.startView.sources")
        default: return locale.t("settings.startView.channels")
        }
    }
}
