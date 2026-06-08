import SwiftUI

struct EpgSearchView: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var stateFilter: String = "all"
    @State private var results: [EpgSearchResult] = []
    @State private var isLoading = false
    @State private var selectedResult: EpgSearchResult?

    private let stateFilters = ["all", "live", "upcoming"]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // State filter chips
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(stateFilters, id: \.self) { filter in
                            Button {
                                stateFilter = filter
                                Task { await search() }
                            } label: {
                                Text(filterLabel(filter))
                                    .font(.subheadline)
                                    .fontWeight(stateFilter == filter ? .semibold : .regular)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background {
                                        if stateFilter == filter {
                                            Capsule().strokeBorder(Color.tiviPrimary, lineWidth: 1.5)
                                        } else {
                                            Capsule().fill(Color.tiviSecondary)
                                        }
                                    }
                                    .foregroundColor(stateFilter == filter ? .tiviPrimary : .primary)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }

                if isLoading {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if results.isEmpty && !searchText.isEmpty {
                    Spacer()
                    VStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 28))
                            .foregroundColor(.tiviMutedForeground)
                        Text(locale.t("epg.empty"))
                            .foregroundColor(.tiviMutedForeground)
                    }
                    Spacer()
                } else {
                    List(results) { result in
                        Button {
                            selectedResult = result
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.title)
                                    .font(.body)
                                    .fontWeight(.medium)

                                Text(result.channelName)
                                    .font(.caption)
                                    .foregroundColor(.tiviPrimary)

                                HStack(spacing: 8) {
                                    let isLive = isProgramLive(result)
                                    if isLive {
                                        Text(locale.t("epg.filter.live").uppercased())
                                            .font(.caption2)
                                            .fontWeight(.bold)
                                            .foregroundColor(.tiviLive)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 4)
                                                    .strokeBorder(Color.tiviLive, lineWidth: 1)
                                            )
                                    }

                                    Text("\(EpgDesktopParity.formatXmltvTime(result.startAt)) – \(EpgDesktopParity.formatXmltvTime(result.endAt))")
                                        .font(.caption)
                                        .foregroundColor(.tiviMutedForeground)
                                }

                                if let desc = result.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundColor(.tiviMutedForeground)
                                        .lineLimit(2)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(locale.t("epg.explorer.title"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: Text(locale.t("epg.searchPlaceholder")))
            .onSubmit(of: .search) { Task { await search() } }
            .onChange(of: searchText) { newValue in
                if newValue.isEmpty {
                    results = []
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.tiviMutedForeground)
                    }
                }
            }
            .sheet(item: $selectedResult) { result in
                EpgDetailSheet(result: result)
                    .environmentObject(playerVM)
            }
        }
    }

    private func search() async {
        guard !searchText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let state: String? = stateFilter == "all" ? nil : stateFilter
            results = try await RustBridge.shared.searchEpg(search: searchText, state: state, limit: 100)
        } catch {
            print("EPG search error: \(error)")
        }
    }

    private func filterLabel(_ filter: String) -> String {
        switch filter {
        case "all": return locale.t("epg.filter.all")
        case "live": return locale.t("epg.filter.live")
        case "upcoming": return locale.t("epg.filter.upcoming")
        default: return filter
        }
    }

    private func isProgramLive(_ result: EpgSearchResult) -> Bool {
        guard let start = EpgDesktopParity.parseXmltvDate(result.startAt),
              let end = EpgDesktopParity.parseXmltvDate(result.endAt) else { return false }
        let now = Date()
        return start <= now && now < end
    }
}

struct EpgDetailSheet: View {
    let result: EpgSearchResult
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(result.title)
                            .font(.title3)
                            .fontWeight(.bold)

                        Text(result.channelName)
                            .font(.subheadline)
                            .foregroundColor(.tiviPrimary)

                        Text("\(EpgDesktopParity.formatXmltvTime(result.startAt)) – \(EpgDesktopParity.formatXmltvTime(result.endAt))")
                            .font(.caption)
                            .foregroundColor(.tiviMutedForeground)

                        if let category = result.category, !category.isEmpty {
                            Text(category)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color.tiviSecondary)
                                .clipShape(Capsule())
                        }
                    }
                }

                Section(locale.t("epg.details")) {
                    Text(result.description ?? locale.t("epg.noDescription"))
                        .font(.body)
                        .foregroundColor(result.description != nil ? .tiviForeground : .tiviMutedForeground)
                }

                Section {
                    Button {
                        Task {
                            if let channel = try? await RustBridge.shared.fetchChannel(channelId: result.channelId) {
                                dismiss()
                                playerVM.play(channel: channel)
                            }
                        }
                    } label: {
                        Label(locale.t("channels.detail.play"), systemImage: "play.fill")
                    }
                }
            }
            .navigationTitle(locale.t("epg.details"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.tiviMutedForeground)
                    }
                }
            }
        }
    }
}
