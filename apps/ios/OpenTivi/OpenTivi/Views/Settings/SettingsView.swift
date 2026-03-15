import SwiftUI

struct SettingsView: View {
    @StateObject private var vm = SettingsViewModel()

    var body: some View {
        Form {
            Section("General") {
                NavigationLink {
                    // Language picker
                    List {
                        Button("English") { Task { await vm.setSetting(key: "locale", value: "\"en-US\"") } }
                        Button("中文") { Task { await vm.setSetting(key: "locale", value: "\"zh-CN\"") } }
                    }
                    .navigationTitle("Language")
                } label: {
                    LabeledContent("Language", value: "English")
                }
            }

            Section("About") {
                LabeledContent("Version", value: "0.1.0")
                LabeledContent("Build", value: "1")

                Link("GitHub", destination: URL(string: "https://github.com/tiangong-dev/opentivi")!)
            }
        }
        .navigationTitle("Settings")
        .task { await vm.load() }
    }
}
