import SwiftUI

struct SettingsView: View {
    @StateObject private var vm = SettingsViewModel()
    @ObservedObject private var locale = LocaleManager.shared

    var body: some View {
        Form {
            Section(locale.t("settings.category.general")) {
                NavigationLink {
                    List {
                        Button {
                            locale.setLocale("en-US")
                            Task { await vm.setSetting(key: "locale", value: "\"en-US\"") }
                        } label: {
                            HStack {
                                Text("English")
                                Spacer()
                                if locale.currentLocale == "en-US" {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                        Button {
                            locale.setLocale("zh-CN")
                            Task { await vm.setSetting(key: "locale", value: "\"zh-CN\"") }
                        } label: {
                            HStack {
                                Text("中文")
                                Spacer()
                                if locale.currentLocale == "zh-CN" {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                    }
                    .navigationTitle(locale.t("settings.locale.label"))
                } label: {
                    LabeledContent(locale.t("settings.locale.label"), value: locale.currentLocale == "zh-CN" ? "中文" : "English")
                }
            }

            Section(locale.t("nav.settings")) {
                LabeledContent("Version", value: "0.1.0")
                LabeledContent("Build", value: "1")
                Link("GitHub", destination: URL(string: "https://github.com/tiangong-dev/opentivi")!)
            }
        }
        .navigationTitle(locale.t("nav.settings"))
        .task { await vm.load() }
    }
}
