import SwiftUI

/// Dimming gradients behind overlay text (shared by full overlay and touch-locked info mode).
struct PlayerOverlayBackground: View {
    var body: some View {
        ZStack {
            VStack {
                LinearGradient(
                    colors: [.black.opacity(0.7), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 120)
                Spacer()
            }
            .ignoresSafeArea()

            VStack {
                Spacer()
                LinearGradient(
                    colors: [.clear, .black.opacity(0.8)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 200)
            }
            .ignoresSafeArea()
        }
    }
}

/// Channel name, EPG, and stream stats (no navigation or control buttons).
struct PlayerInfoPanel: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared
    var showSwipeHint: Bool = true

    private func formatSpeed(_ bps: Double) -> String {
        if bps >= 1_000_000 {
            return String(format: "%.1f Mbps", bps / 1_000_000)
        } else if bps >= 1_000 {
            return String(format: "%.0f Kbps", bps / 1_000)
        }
        return "--"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let channel = playerVM.currentChannel {
                Text(channel.name)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                if let group = channel.groupName {
                    Text(group)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.7))
                }
            }

            if let snapshot = playerVM.epgSnapshot {
                if let now = snapshot.now {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(locale.t("player.now").uppercased())
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundColor(.tiviLive)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .strokeBorder(Color.tiviLive, lineWidth: 1)
                                )
                            Text(now.title)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                        }
                        Text(
                            "\(EpgDesktopParity.formatXmltvTime(now.startAt)) – \(EpgDesktopParity.formatXmltvTime(now.endAt))"
                        )
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.65))
                    }
                    .foregroundColor(.white)
                }

                if let next = snapshot.next {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(locale.t("player.next").uppercased())
                                .font(.caption)
                                .fontWeight(.bold)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.tiviMuted)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                            Text(next.title)
                                .font(.subheadline)
                        }
                        Text(
                            "\(EpgDesktopParity.formatXmltvTime(next.startAt)) – \(EpgDesktopParity.formatXmltvTime(next.endAt))"
                        )
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.55))
                    }
                    .foregroundColor(.white.opacity(0.85))
                }
            }

            HStack(spacing: 16) {
                let observed = playerVM.observedBitrateBps
                let indicated = playerVM.indicatedBitrateBps

                HStack(spacing: 4) {
                    Image(systemName: "arrow.down.circle")
                        .font(.caption2)
                    Text(observed > 0 ? formatSpeed(observed) : "--")
                        .font(.caption)
                        .monospacedDigit()
                }
                .foregroundColor(.white.opacity(0.75))

                if indicated > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "dot.radiowaves.left.and.right")
                            .font(.caption2)
                        Text(formatSpeed(indicated))
                            .font(.caption)
                            .monospacedDigit()
                    }
                    .foregroundColor(.white.opacity(0.6))
                }
            }

            // Error & retry
            if let error = playerVM.playbackError {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.tiviDestructive)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.tiviDestructive)
                    Button {
                        playerVM.retryPlayback()
                    } label: {
                        Text("Retry")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .foregroundColor(.tiviPrimary)
                            .overlay(Capsule().strokeBorder(Color.tiviPrimary, lineWidth: 1.5))
                    }
                }
            }

            // Source indicator (tappable to switch)
            if playerVM.candidateCount > 1 {
                Button {
                    playerVM.switchSource()
                } label: {
                    HStack(spacing: 4) {
                        Text("\(locale.t("player.source")) \(playerVM.currentCandidateIdx + 1)/\(playerVM.candidateCount)")
                            .font(.caption)
                            .fontWeight(.semibold)
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.caption2)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.15))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                    .foregroundColor(.white)
                }
                .buttonStyle(.plain)
            }

            if playerVM.retryCount > 0 {
                Text("\(locale.t("player.retryCount")): \(playerVM.retryCount)")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.5))
            }

            if showSwipeHint {
                Text(locale.t("player.swipeHint"))
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.5))
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PlayerOverlay: View {
    @EnvironmentObject var playerVM: PlayerViewModel

    private func toggleVideoLandscape() {
        withAnimation(.easeInOut(duration: 0.25)) {
            playerVM.isVideoLandscape.toggle()
        }
    }

    var body: some View {
        ZStack {
            PlayerOverlayBackground()

            VStack {
                // Top bar: back button + action buttons
                HStack {
                    Button {
                        playerVM.isFullScreen = false
                    } label: {
                        Image(systemName: "chevron.down.circle.fill")
                            .font(.system(size: 32))
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                    .padding(.leading, 20)
                    .padding(.top, 12)

                    Spacer()

                    // Favorite toggle
                    Button {
                        playerVM.toggleFavorite()
                    } label: {
                        Image(systemName: playerVM.isFavorite ? "heart.fill" : "heart")
                            .font(.system(size: 24))
                            .foregroundStyle(playerVM.isFavorite ? Color.tiviFavorite : .white)
                            .shadow(radius: 4)
                    }
                    .padding(.top, 12)

                    // Diagnostics toggle
                    Button {
                        withAnimation { playerVM.showDiagnostics.toggle() }
                    } label: {
                        Image(systemName: "info.circle")
                            .font(.system(size: 24))
                            .foregroundStyle(playerVM.showDiagnostics ? .tiviPrimary : .white)
                            .shadow(radius: 4)
                    }
                    .padding(.top, 12)

                    // Channel list toggle
                    Button {
                        withAnimation { playerVM.showChannelList.toggle() }
                    } label: {
                        Image(systemName: "list.bullet")
                            .font(.system(size: 24))
                            .foregroundStyle(playerVM.showChannelList ? .tiviPrimary : .white)
                            .shadow(radius: 4)
                    }
                    .padding(.top, 12)

                    Button {
                        toggleVideoLandscape()
                    } label: {
                        Image(systemName: playerVM.isVideoLandscape
                              ? "rectangle.portrait.arrowtriangle.2.outward"
                              : "rectangle.arrowtriangle.2.outward")
                            .font(.system(size: 26))
                            .foregroundStyle(.white)
                            .shadow(radius: 4)
                    }
                    .padding(.trailing, 20)
                    .padding(.top, 12)
                }

                Spacer()

                // Left-center: lock button
                HStack {
                    Button {
                        withAnimation { playerVM.isLocked = true }
                    } label: {
                        Image(systemName: "lock.open.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.white)
                            .padding(12)
                            .background(.ultraThinMaterial, in: Circle())
                            .shadow(radius: 4)
                    }
                    .padding(.leading, 20)
                    Spacer()
                }

                Spacer()

                PlayerInfoPanel(showSwipeHint: true)
            }

            // Diagnostics panel
            if playerVM.showDiagnostics {
                PlayerDiagnosticsPanel()
                    .environmentObject(playerVM)
                    .transition(.move(edge: .trailing))
            }

            // Channel list panel
            if playerVM.showChannelList {
                PlayerChannelListPanel()
                    .environmentObject(playerVM)
                    .transition(.move(edge: .leading))
            }
        }
    }
}

// MARK: - Diagnostics Panel

struct PlayerDiagnosticsPanel: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

    private func formatSpeed(_ bps: Double) -> String {
        if bps >= 1_000_000 {
            return String(format: "%.1f Mbps", bps / 1_000_000)
        } else if bps >= 1_000 {
            return String(format: "%.0f Kbps", bps / 1_000)
        }
        return "--"
    }

    var body: some View {
        VStack(alignment: .trailing) {
            HStack {
                Spacer()
                VStack(alignment: .leading, spacing: 6) {
                    diagRow(locale.t("player.playbackEngine"), "VLC")
                    diagRow(locale.t("player.streamKind"), playerVM.vlcState)
                    diagRow(locale.t("player.networkSpeed"), formatSpeed(playerVM.observedBitrateBps))
                    if playerVM.indicatedBitrateBps > 0 {
                        diagRow(locale.t("player.decoderInfo"), formatSpeed(playerVM.indicatedBitrateBps))
                    }
                    if let size = playerVM.streamPlayer.videoSize {
                        diagRow(locale.t("player.videoResolution"), "\(Int(size.width))x\(Int(size.height))")
                    }
                    if let channel = playerVM.currentChannel {
                        diagRow(locale.t("player.activeLine"), channel.streamUrl)
                    }
                    if playerVM.retryCount > 0 {
                        diagRow(locale.t("player.retryCount"), "\(playerVM.retryCount)")
                    }
                }
                .padding(12)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                .environment(\.colorScheme, .dark)
                .padding(.trailing, 12)
                .padding(.top, 60)
            }
            Spacer()
        }
    }

    private func diagRow(_ label: String, _ value: String) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.white.opacity(0.6))
            Text(value)
                .font(.caption2)
                .fontWeight(.medium)
                .foregroundColor(.white)
                .lineLimit(1)
        }
    }
}

// MARK: - Channel List Panel

struct PlayerChannelListPanel: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text(locale.t("player.channelsPanelTitle"))
                            .font(.headline)
                            .foregroundColor(.white)
                        Spacer()
                        Button {
                            withAnimation { playerVM.showChannelList = false }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title3)
                                .foregroundColor(.white.opacity(0.6))
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 2) {
                                ForEach(Array(playerVM.channelList.enumerated()), id: \.element.id) { index, channel in
                                    Button {
                                        playerVM.play(channel: channel)
                                        withAnimation { playerVM.showChannelList = false }
                                    } label: {
                                        HStack(spacing: 10) {
                                            ChannelLogo(url: channel.logoUrl, size: 32)

                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(channel.name)
                                                    .font(.subheadline)
                                                    .fontWeight(channel.id == playerVM.currentChannel?.id ? .bold : .regular)
                                                    .foregroundColor(.white)
                                                    .lineLimit(1)

                                                if let group = channel.groupName {
                                                    Text(group)
                                                        .font(.caption2)
                                                        .foregroundColor(.white.opacity(0.5))
                                                        .lineLimit(1)
                                                }
                                            }

                                            Spacer()

                                            if channel.id == playerVM.currentChannel?.id {
                                                Image(systemName: "speaker.wave.2.fill")
                                                    .font(.caption)
                                                    .foregroundColor(.tiviPrimary)
                                            }
                                        }
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(
                                            channel.id == playerVM.currentChannel?.id
                                                ? Color.tiviPrimary.opacity(0.2)
                                                : Color.clear
                                        )
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .id(channel.id)
                                }
                            }
                        }
                        .onAppear {
                            if let current = playerVM.currentChannel {
                                proxy.scrollTo(current.id, anchor: .center)
                            }
                        }
                    }
                }
                .frame(width: 280)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                .environment(\.colorScheme, .dark)
                .padding(.leading, 8)
                .padding(.top, 50)
                .padding(.bottom, 20)

                Spacer()
            }
        }
    }
}
