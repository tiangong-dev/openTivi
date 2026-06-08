import SwiftUI

enum SourceFilter: String, CaseIterable {
    case all, enabled, disabled, backoff, error
}

struct SourcesView: View {
    @StateObject private var vm = SourcesViewModel()
    @ObservedObject private var locale = LocaleManager.shared
    @State private var showAddSheet = false
    @State private var isRefreshingAll = false
    @State private var sourceToEdit: SourceInfo?
    @State private var sourceToDelete: SourceInfo?
    @State private var sourceFilter: SourceFilter = .all

    private var filteredSources: [SourceInfo] {
        switch sourceFilter {
        case .all: return vm.sources
        case .enabled: return vm.sources.filter { $0.enabled && $0.consecutiveRefreshFailures == 0 }
        case .disabled: return vm.sources.filter { !$0.enabled }
        case .backoff: return vm.sources.filter { $0.nextRetryAt != nil }
        case .error: return vm.sources.filter { $0.lastRefreshError != nil && $0.enabled }
        }
    }

    var body: some View {
        List {
            // Status filter chips
            if !vm.sources.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(SourceFilter.allCases, id: \.self) { filter in
                            let count = countForFilter(filter)
                            Button {
                                sourceFilter = filter
                            } label: {
                                HStack(spacing: 4) {
                                    Text(filterLabel(filter))
                                    if filter != .all {
                                        Text("\(count)")
                                            .font(.caption2)
                                            .fontWeight(.bold)
                                    }
                                }
                                .font(.subheadline)
                                .fontWeight(sourceFilter == filter ? .semibold : .regular)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background {
                                    if sourceFilter == filter {
                                        Capsule().strokeBorder(Color.tiviPrimary, lineWidth: 1.5)
                                    } else {
                                        Capsule().fill(.ultraThinMaterial)
                                    }
                                }
                                .foregroundColor(sourceFilter == filter ? .tiviPrimary : .primary)
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
            }

            if filteredSources.isEmpty && !vm.sources.isEmpty {
                HStack {
                    Spacer()
                    Text(locale.t("sources.filter.empty"))
                        .font(.subheadline)
                        .foregroundColor(.tiviMutedForeground)
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }

            ForEach(filteredSources) { source in
                Button {
                    sourceToEdit = source
                } label: {
                    HStack(alignment: .top, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(source.name)
                                    .font(.body)
                                    .fontWeight(.medium)
                                    .foregroundColor(.tiviForeground)

                                Spacer(minLength: 8)

                                Text(source.kind.uppercased())
                                    .font(.caption2)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.tiviPrimary.opacity(0.2))
                                    .foregroundColor(.tiviPrimary)
                                    .clipShape(RoundedRectangle(cornerRadius: 4))

                                sourceStatusBadge(source)
                            }

                            Text(sourceOverviewLine(source: source, locale: locale))
                                .font(.caption)
                                .foregroundColor(.tiviMutedForeground)
                                .multilineTextAlignment(.leading)

                            if let imported = source.lastImportedAt {
                                Text(locale.t("sources.lastImport", ["time": imported]))
                                    .font(.caption2)
                                    .foregroundColor(.tiviMutedForeground)
                            }

                            if let error = source.lastRefreshError {
                                Text(locale.t("sources.status.lastError", ["error": error]))
                                    .font(.caption2)
                                    .foregroundColor(.tiviDestructive)
                                    .lineLimit(2)
                            }
                        }

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tiviMutedForeground)
                            .padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(locale.t("sources.row.editHint"))
                .contextMenu {
                    Button {
                        sourceToEdit = source
                    } label: {
                        Label(locale.t("sources.action.edit"), systemImage: "pencil")
                    }
                    Button {
                        Task { await vm.refreshSource(sourceId: source.id) }
                    } label: {
                        Label(locale.t("sources.action.refresh"), systemImage: "arrow.clockwise")
                    }
                    Divider()
                    Button(role: .destructive) {
                        sourceToDelete = source
                    } label: {
                        Label(locale.t("sources.action.delete"), systemImage: "trash")
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
                    .tint(.tiviPrimary)
                }
                .swipeActions(edge: .leading, allowsFullSwipe: false) {
                    Button {
                        sourceToEdit = source
                    } label: {
                        Label(locale.t("sources.action.edit"), systemImage: "pencil")
                    }
                    .tint(.tiviWarning)
                }
            }
        }
        .listStyle(.insetGrouped)
        .contentMargins(.bottom, 100, for: .scrollContent)
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
                        .font(.system(size: 32))
                        .foregroundColor(.tiviMutedForeground)
                    Text(locale.t("sources.title"))
                        .font(.tiviH3)
                    Text(locale.t("sources.empty"))
                        .font(.tiviSmall)
                        .foregroundColor(.tiviMutedForeground)
                        .multilineTextAlignment(.center)
                }
            }
            if vm.isLoading && vm.sources.isEmpty { LoadingView() }
        }
        .task { await vm.load() }
    }

    @ViewBuilder
    private func sourceStatusBadge(_ source: SourceInfo) -> some View {
        if !source.enabled {
            Text(locale.t("sources.status.disabled"))
                .font(.caption2)
                .fontWeight(.bold)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.tiviMuted.opacity(0.3))
                .foregroundColor(.tiviMutedForeground)
                .clipShape(RoundedRectangle(cornerRadius: 4))
        } else if source.nextRetryAt != nil {
            Text(locale.t("sources.status.backoff"))
                .font(.caption2)
                .fontWeight(.bold)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.tiviWarning.opacity(0.2))
                .foregroundColor(.tiviWarning)
                .clipShape(RoundedRectangle(cornerRadius: 4))
        } else if source.lastRefreshError != nil {
            Text(locale.t("sources.status.error"))
                .font(.caption2)
                .fontWeight(.bold)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.tiviDestructive.opacity(0.2))
                .foregroundColor(.tiviDestructive)
                .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }

    private func filterLabel(_ filter: SourceFilter) -> String {
        switch filter {
        case .all: return locale.t("sources.filter.all")
        case .enabled: return locale.t("sources.filter.enabled")
        case .disabled: return locale.t("sources.filter.disabled")
        case .backoff: return locale.t("sources.filter.backoff")
        case .error: return locale.t("sources.filter.error")
        }
    }

    private func countForFilter(_ filter: SourceFilter) -> Int {
        switch filter {
        case .all: return vm.sources.count
        case .enabled: return vm.sources.filter { $0.enabled && $0.consecutiveRefreshFailures == 0 }.count
        case .disabled: return vm.sources.filter { !$0.enabled }.count
        case .backoff: return vm.sources.filter { $0.nextRetryAt != nil }.count
        case .error: return vm.sources.filter { $0.lastRefreshError != nil && $0.enabled }.count
        }
    }

    private func sourceOverviewLine(source: SourceInfo, locale: LocaleManager) -> String {
        if source.kind.lowercased() == "xmltv" {
            locale.t("sources.overview.epgPrograms", ["count": "\(source.epgProgramCount)"])
        } else {
            locale.t("sources.overview.channels", [
                "channels": "\(source.channelCount)",
                "groups": "\(source.groupCount)",
                "withTvgId": "\(source.channelsWithTvgId)",
            ])
        }
    }
}
