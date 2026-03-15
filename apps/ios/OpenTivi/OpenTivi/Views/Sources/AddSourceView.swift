import SwiftUI

struct AddSourceView: View {
    @ObservedObject var vm: SourcesViewModel
    @Binding var isPresented: Bool

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

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $selectedTab) {
                    Text("M3U").tag(0)
                    Text("Xtream").tag(1)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)

                if selectedTab == 0 {
                    Section("M3U Source") {
                        TextField("Name", text: $m3uName)
                        TextField("M3U URL or file path", text: $m3uLocation)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                    }
                } else {
                    Section("Xtream Codes") {
                        TextField("Name", text: $xtreamName)
                        TextField("Server URL", text: $xtreamServer)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                        TextField("Username", text: $xtreamUsername)
                            .textInputAutocapitalization(.never)
                        SecureField("Password", text: $xtreamPassword)
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
                                Text("Import")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isImporting || !isFormValid)
                }
            }
            .navigationTitle("Add Source")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                }
            }
        }
    }

    private var isFormValid: Bool {
        if selectedTab == 0 {
            return !m3uName.isEmpty && !m3uLocation.isEmpty
        } else {
            return !xtreamName.isEmpty && !xtreamServer.isEmpty && !xtreamUsername.isEmpty && !xtreamPassword.isEmpty
        }
    }

    private func doImport() async {
        isImporting = true
        defer { isImporting = false }

        if selectedTab == 0 {
            await vm.importM3u(name: m3uName, location: m3uLocation, autoRefreshMinutes: nil)
        } else {
            await vm.importXtream(name: xtreamName, serverUrl: xtreamServer, username: xtreamUsername, password: xtreamPassword)
        }

        isPresented = false
    }
}
