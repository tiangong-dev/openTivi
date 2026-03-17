import SwiftUI

struct EditSourceView: View {
    let source: SourceInfo
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var location: String

    init(source: SourceInfo) {
        self.source = source
        _name = State(initialValue: source.name)
        _location = State(initialValue: source.location)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Source Details") {
                    TextField("Name", text: $name)
                    TextField("Location", text: $location)
                        .textInputAutocapitalization(.never)
                }

                Section {
                    LabeledContent("Type", value: source.kind.uppercased())
                    LabeledContent("Channels", value: "\(source.channelCount)")
                }
            }
            .navigationTitle("Edit Source")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            try? await RustBridge.shared.updateSource(
                                sourceId: source.id,
                                name: name,
                                location: location,
                                username: source.username,
                                password: source.password,
                                autoRefreshMinutes: source.autoRefreshMinutes,
                                enabled: source.enabled
                            )
                            dismiss()
                        }
                    }
                    .disabled(name.isEmpty || location.isEmpty)
                }
            }
        }
    }
}
