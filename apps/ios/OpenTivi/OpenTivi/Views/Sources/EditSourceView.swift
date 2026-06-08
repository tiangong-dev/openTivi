import SwiftUI

struct EditSourceView: View {
    let source: SourceInfo
    @ObservedObject var vm: SourcesViewModel
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var locale = LocaleManager.shared

    @State private var name: String
    @State private var location: String
    @State private var username: String
    @State private var password: String
    @State private var autoRefreshEnabled: Bool
    @State private var autoRefreshMinutes: String
    @State private var enabled: Bool
    @State private var isSaving = false
    @State private var saveError: String?

    private var isXtream: Bool { source.kind.lowercased() == "xtream" }

    private var canSave: Bool {
        guard !name.isEmpty, !location.isEmpty, !isSaving else { return false }
        if isXtream { return !username.isEmpty }
        return true
    }

    init(source: SourceInfo, vm: SourcesViewModel) {
        self.source = source
        self.vm = vm
        _name = State(initialValue: source.name)
        _location = State(initialValue: source.location)
        _username = State(initialValue: source.username ?? "")
        _password = State(initialValue: source.password ?? "")
        _autoRefreshEnabled = State(initialValue: source.autoRefreshMinutes != nil)
        _autoRefreshMinutes = State(initialValue: source.autoRefreshMinutes.map { "\($0)" } ?? "60")
        _enabled = State(initialValue: source.enabled)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(locale.t("sources.form.sourceDetails")) {
                    TextField(locale.t("sources.form.name"), text: $name)

                    if isXtream {
                        TextField(locale.t("sources.form.serverUrl"), text: $location)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                    } else {
                        TextField(locale.t("sources.edit.location"), text: $location)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                    }
                }

                if isXtream {
                    Section(locale.t("sources.form.xtreamSection")) {
                        TextField(locale.t("sources.form.username"), text: $username)
                            .textInputAutocapitalization(.never)
                        SecureField(locale.t("sources.form.password"), text: $password)
                    }
                }

                Section(locale.t("sources.edit.options")) {
                    Toggle(locale.t("sources.edit.enabled"), isOn: $enabled)

                    Toggle(locale.t("sources.edit.autoRefresh"), isOn: $autoRefreshEnabled)

                    if autoRefreshEnabled {
                        HStack {
                            Text(locale.t("sources.edit.refreshInterval"))
                            Spacer()
                            TextField("60", text: $autoRefreshMinutes)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(width: 60)
                            Text(locale.t("sources.edit.minutes"))
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section {
                    LabeledContent(locale.t("sources.form.type"), value: source.kind.uppercased())
                    LabeledContent(locale.t("sources.form.channels"), value: "\(source.channelCount)")
                    LabeledContent(locale.t("sources.edit.groups"), value: "\(source.groupCount)")

                    if let imported = source.lastImportedAt {
                        LabeledContent(locale.t("sources.edit.lastImport"), value: imported)
                    }

                    if let error = source.lastRefreshError {
                        LabeledContent(locale.t("sources.edit.lastError")) {
                            Text(error)
                                .foregroundColor(.tiviDestructive)
                                .font(.caption)
                        }
                    }
                }
            }
            .navigationTitle(locale.t("sources.edit.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("sources.edit.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("sources.edit.save")) {
                        Task {
                            isSaving = true
                            saveError = nil
                            defer { isSaving = false }
                            let trimmedInterval = autoRefreshMinutes.trimmingCharacters(in: .whitespacesAndNewlines)
                            let refreshMins: UInt32?
                            if autoRefreshEnabled {
                                if let v = UInt32(trimmedInterval), v > 0 {
                                    refreshMins = v
                                } else {
                                    refreshMins = 60
                                }
                            } else {
                                refreshMins = nil
                            }
                            let err = await vm.updateSource(
                                sourceId: source.id,
                                name: name,
                                location: location,
                                username: isXtream ? username : source.username,
                                password: isXtream ? password : source.password,
                                autoRefreshMinutes: refreshMins,
                                enabled: enabled
                            )
                            if let err {
                                saveError = err
                            } else {
                                dismiss()
                            }
                        }
                    }
                    .disabled(!canSave)
                }
            }
            .alert(locale.t("sources.edit.saveFailedTitle"), isPresented: Binding(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } }
            )) {
                Button(locale.t("sources.edit.dismissError"), role: .cancel) { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
        }
    }
}
