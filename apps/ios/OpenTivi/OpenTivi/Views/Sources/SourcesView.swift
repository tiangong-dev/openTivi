import SwiftUI

struct SourcesView: View {
    @StateObject private var vm = SourcesViewModel()
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
                        vm.deleteSource(sourceId: source.id)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }

                    Button {
                        Task { await vm.refreshSource(sourceId: source.id) }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .tint(.blue)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await vm.load() }
        .navigationTitle("Sources")
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
                    "No Sources",
                    systemImage: "antenna.radiowaves.left.and.right",
                    description: Text("Tap + to import an M3U or Xtream source.")
                )
            }
            if vm.isLoading && vm.sources.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }
}
