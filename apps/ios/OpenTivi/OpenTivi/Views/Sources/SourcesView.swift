import SwiftUI

struct SourcesView: View {
    @StateObject private var vm = SourcesViewModel()
    @ObservedObject private var locale = LocaleManager.shared
    @State private var showAddSheet = false
    @State private var isRefreshingAll = false
    @State private var sourceToEdit: SourceInfo?
    @State private var sourceToDelete: SourceInfo?

    var body: some View {
        List {
            ForEach(vm.sources) { source in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(source.name)
                            .font(.body)
                            .fontWeight(.medium)

                        Spacer()

                        Text(source.kind.uppercased())
                            .font(.caption2)
                            .fontWeight(.bold)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.accentColor.opacity(0.2))
                            .foregroundColor(.accentColor)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }

                    Text(locale.t("sources.channelsAndGroups", ["channels": "\(source.channelCount)", "groups": "\(source.groupCount)"]))
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if let imported = source.lastImportedAt {
                        Text(locale.t("sources.lastImport", ["time": imported]))
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        sourceToDelete = source
                    } label: {
                        Label(locale.t("sources.action.delete"), systemImage: "trash")
                    }

                    Button {
                        Task { await vm.refreshSource(sourceId: source.id) }
                    } label: {
                        Label(locale.t("sources.action.refresh"), systemImage: "arrow.clockwise")
                    }
                    .tint(.blue)
                }
                .swipeActions(edge: .leading, allowsFullSwipe: false) {
                    Button {
                        sourceToEdit = source
                    } label: {
                        Label(locale.t("sources.action.edit"), systemImage: "pencil")
                    }
                    .tint(.orange)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await vm.load() }
        .navigationTitle(locale.t("sources.title"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 16) {
                    Button {
                        Task {
                            isRefreshingAll = true
                            await vm.refreshAllSources()
                            isRefreshingAll = false
                        }
                    } label: {
                        if isRefreshingAll {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(isRefreshingAll || vm.sources.isEmpty)

                    Button {
                        showAddSheet = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddSourceView(vm: vm, isPresented: $showAddSheet)
        }
        .sheet(item: $sourceToEdit, onDismiss: {
            Task { await vm.load() }
        }) { source in
            EditSourceView(source: source, vm: vm)
        }
        .confirmationDialog(
            locale.t("sources.deleteConfirm.title"),
            isPresented: Binding(
                get: { sourceToDelete != nil },
                set: { if !$0 { sourceToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(locale.t("sources.deleteConfirm.confirm"), role: .destructive) {
                if let source = sourceToDelete {
                    Task { await vm.deleteSource(sourceId: source.id) }
                }
                sourceToDelete = nil
            }
            Button(locale.t("sources.deleteConfirm.cancel"), role: .cancel) {
                sourceToDelete = nil
            }
        } message: {
            if let source = sourceToDelete {
                Text(locale.t("sources.deleteConfirm.message", ["name": source.name]))
            }
        }
        .overlay {
            if vm.sources.isEmpty && !vm.isLoading {
                VStack(spacing: 12) {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.system(size: 36))
                        .foregroundColor(.secondary)
                    Text(locale.t("sources.title"))
                        .font(.headline)
                    Text(locale.t("sources.empty"))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            if vm.isLoading && vm.sources.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }
}
