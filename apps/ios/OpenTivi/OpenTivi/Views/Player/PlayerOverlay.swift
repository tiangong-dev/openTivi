import SwiftUI
import UIKit

struct PlayerOverlay: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

    private var isCurrentlyLandscape: Bool {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else {
            return false
        }
        return scene.interfaceOrientation.isLandscape
    }

    private func toggleOrientation() {
        let target: UIInterfaceOrientationMask = isCurrentlyLandscape ? .portrait : .landscape
        playerVM.preferredOrientation = target
    }

    /// Format bits-per-second into a compact human-readable string.
    private func formatSpeed(_ bps: Double) -> String {
        if bps >= 1_000_000 {
            return String(format: "%.1f Mbps", bps / 1_000_000)
        } else if bps >= 1_000 {
            return String(format: "%.0f Kbps", bps / 1_000)
        }
        return "--"
    }

    var body: some View {
        ZStack {
            // Top gradient -- keeps back button visible against bright video
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

            // Bottom gradient for channel info
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

            VStack {
                // Top bar: back button
                HStack {
                    Button {
                        playerVM.preferredOrientation = nil
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
                    Button {
                        toggleOrientation()
                    } label: {
                        Image(systemName: isCurrentlyLandscape
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
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                            .shadow(radius: 4)
                    }
                    .padding(.leading, 20)
                    Spacer()
                }

                Spacer()

                // Bottom: channel info + EPG + stream stats
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
                            HStack {
                                Text(locale.t("player.now").uppercased())
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.red)
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                                Text(now.title)
                                    .font(.subheadline)
                            }
                            .foregroundColor(.white)
                        }

                        if let next = snapshot.next {
                            HStack {
                                Text(locale.t("player.next").uppercased())
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.gray)
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                                Text(next.title)
                                    .font(.subheadline)
                            }
                            .foregroundColor(.white.opacity(0.8))
                        }
                    }

                    // Stream speed / bitrate (like Desktop overlay)
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

                    Text(locale.t("player.swipeHint"))
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.5))
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
