import SwiftUI

struct AddSourceView: View {
    @ObservedObject var vm: SourcesViewModel
    @Binding var isPresented: Bool
    @ObservedObject private var locale = LocaleManager.shared

    @State private var selectedTab = 0
    @State private var isImporting = false

    // M3U fields
    @State private var m3uName = ""
    @State private var m3uLocation = ""

    // Xtream fields
    @State private var xtreamName = ""
    @State private var xtreamServer = ""
    @State private var xtreamUsername = ""
    @State private var xtreamPassword = ""

    // XMLTV fields
    @State private var xmltvName = ""
    @State private var xmltvLocation = ""

    var body: some View {
        NavigationStack {
            Form {
                Picker(locale.t("sources.form.type"), selection: $selectedTab) {
                    Text("M3U").tag(0)
                    Text("Xtream").tag(1)
                    Text("XMLTV").tag(2)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)

                if selectedTab == 0 {
                    Section(locale.t("sources.form.m3uSection")) {
                        TextField(locale.t("sources.form.name"), text: $m3uName)
                        TextField(locale.t("sources.form.m3uLocation"), text: $m3uLocation)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                    }
                } else if selectedTab == 1 {
                    Section(locale.t("sources.form.xtreamSection")) {
                        TextField(locale.t("sources.form.name"), text: $xtreamName)
                        TextField(locale.t("sources.form.serverUrl"), text: $xtreamServer)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                        TextField(locale.t("sources.form.username"), text: $xtreamUsername)
                            .textInputAutocapitalization(.never)
                        SecureField(locale.t("sources.form.password"), text: $xtreamPassword)
                    }
                } else {
                    Section(locale.t("sources.form.sourceDetails")) {
                        TextField(locale.t("sources.form.name"), text: $xmltvName)
                        TextField(locale.t("sources.form.xmltvLocation"), text: $xmltvLocation)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                    }
                }

                Section {
                    Button {
                        Task { await doImport() }
                    } label: {
                        HStack {
                            Spacer()
                            if isImporting {
                                ProgressView()
                            } else {
                                Text(locale.t("sources.form.import"))
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isImporting || !isFormValid)
                }
            }
            .navigationTitle(locale.t("sources.add.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("sources.edit.cancel")) { isPresented = false }
                }
            }
            .interactiveDismissDisabled(isImporting)
        }
    }

    private var isFormValid: Bool {
        if selectedTab == 0 {
            return !m3uName.isEmpty && !m3uLocation.isEmpty
        } else if selectedTab == 1 {
            return !xtreamName.isEmpty && !xtreamServer.isEmpty && !xtreamUsername.isEmpty && !xtreamPassword.isEmpty
        } else {
            return !xmltvName.isEmpty && !xmltvLocation.isEmpty
        }
    }

    private func doImport() async {
        isImporting = true
        defer { isImporting = false }

        if selectedTab == 0 {
            await vm.importM3u(name: m3uName, location: m3uLocation, autoRefreshMinutes: nil)
        } else if selectedTab == 1 {
            await vm.importXtream(name: xtreamName, serverUrl: xtreamServer, username: xtreamUsername, password: xtreamPassword)
        } else {
            await vm.importXmltv(name: xmltvName, location: xmltvLocation)
        }

        isPresented = false
    }
}
