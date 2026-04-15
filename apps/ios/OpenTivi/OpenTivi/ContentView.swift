import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared
    @State private var selectedTab: Tab = .channels
    @Namespace private var tabAnimation

    enum Tab: String, CaseIterable {
        case channels, favorites, recents, sources, settings

        var icon: String {
            switch self {
            case .channels: return "tv"
            case .favorites: return "star.fill"
            case .recents: return "clock"
            case .sources: return "antenna.radiowaves.left.and.right"
            case .settings: return "gearshape"
            }
        }

        func label(_ locale: LocaleManager) -> String {
            switch self {
            case .channels: return locale.t("nav.channels")
            case .favorites: return locale.t("nav.favorites")
            case .recents: return locale.t("nav.recents")
            case .sources: return locale.t("nav.sources")
            case .settings: return locale.t("nav.settings")
            }
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // Content area — edge-to-edge behind the tab bar
            Group {
                switch selectedTab {
                case .channels:
                    NavigationStack { ChannelsView() }
                case .favorites:
                    NavigationStack { FavoritesView() }
                case .recents:
                    NavigationStack { RecentsView() }
                case .sources:
                    NavigationStack { SourcesView() }
                case .settings:
                    NavigationStack { SettingsView() }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Bottom stack: mini player + floating tab bar
            VStack(spacing: 8) {
                if playerVM.isPlaying {
                    MiniPlayerBar()
                        .environmentObject(playerVM)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                floatingTabBar
            }
            .padding(.bottom, 8)
        }
        .ignoresSafeArea(.keyboard)
        .task {
            await applyStoredSettings()
        }
        .fullScreenCover(isPresented: $playerVM.isFullScreen) {
            FullScreenPlayerContainer {
                PlayerView().environmentObject(playerVM)
            }
        }
        .onChange(of: playerVM.isFullScreen) { isOpen in
            if !isOpen {
                playerVM.isVideoLandscape = false
                if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene {
                    scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
                }
            }
        }
    }

    // MARK: - Floating Glass Tab Bar

    private var floatingTabBar: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { tab in
                tabButton(for: tab)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 6)
        .background {
            Capsule()
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.15), radius: 16, y: 8)
                .overlay {
                    Capsule()
                        .strokeBorder(
                            LinearGradient(
                                colors: [
                                    .white.opacity(0.3),
                                    .white.opacity(0.05),
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                            lineWidth: 0.5
                        )
                }
        }
        .padding(.horizontal, 24)
    }

    private func tabButton(for tab: Tab) -> some View {
        let isSelected = selectedTab == tab

        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: 2) {
                Image(systemName: tab.icon)
                    .font(.system(size: 18, weight: isSelected ? .semibold : .regular))
                    .symbolRenderingMode(.hierarchical)

                Text(tab.label(locale))
                    .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(isSelected ? Color.tiviPrimary : Color.tiviMutedForeground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background {
                if isSelected {
                    Capsule()
                        .fill(Color.tiviPrimary.opacity(0.12))
                        .matchedGeometryEffect(id: "activeTab", in: tabAnimation)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab.label(locale))
    }

    // MARK: - Settings

    private func applyStoredSettings() async {
        guard let settings = try? await RustBridge.shared.fetchSettings() else { return }

        // Apply locale
        let localeKeys = ["ui.locale", "locale"]
        for key in localeKeys {
            guard let raw = settings.first(where: { $0.key == key })?.value else { continue }
            let code = unquote(raw)
            if code == "en-US" || code == "zh-CN" {
                await MainActor.run { locale.setLocale(code) }
                break
            }
        }

        // Apply start view
        if let raw = settings.first(where: { $0.key == "app.startView" })?.value {
            let value = unquote(raw)
            if let tab = Tab(rawValue: value) {
                await MainActor.run { selectedTab = tab }
            }
        }

        // Restore last channel
        if let raw = settings.first(where: { $0.key == "player.lastChannelId" })?.value {
            let value = unquote(raw)
            if let channelId = Int64(value) {
                do {
                    if let channel = try await RustBridge.shared.fetchChannel(channelId: channelId) {
                        await MainActor.run { playerVM.play(channel: channel) }
                    }
                } catch {
                    print("Failed to restore last channel: \(error)")
                }
            }
        }
    }

    private func unquote(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count >= 2, trimmed.first == "\"", trimmed.last == "\"" {
            return String(trimmed.dropFirst().dropLast())
        }
        return trimmed
    }
}
