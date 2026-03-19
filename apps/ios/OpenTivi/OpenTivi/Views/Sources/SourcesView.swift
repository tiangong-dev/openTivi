import SwiftUI

struct SourcesView: View {
    @StateObject private var vm = SourcesViewModel()
    @ObservedObject private var locale = LocaleManager.shared
    @State private var showAddSheet = false

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

                    Text("\(source.channelCount) channels · \(source.groupCount) groups")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if let imported = source.lastImportedAt {
                        Text("Last import: \(imported)")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        Task { await vm.deleteSource(sourceId: source.id) }
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
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await vm.load() }
        .navigationTitle(locale.t("sources.title"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showAddSheet = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddSourceView(vm: vm, isPresented: $showAddSheet)
        }
        .overlay {
            if vm.sources.isEmpty && !vm.isLoading {
                ContentUnavailableView(
                    locale.t("sources.title"),
                    systemImage: "antenna.radiowaves.left.and.right",
                    description: Text(locale.t("sources.empty"))
                )
            }
            if vm.isLoading && vm.sources.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }
}
