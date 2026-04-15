import SwiftUI

struct MiniPlayerBar: View {
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

    var body: some View {
        HStack(spacing: 12) {
            ChannelLogo(url: playerVM.currentChannel?.logoUrl, size: 36)

            VStack(alignment: .leading, spacing: 1) {
                Text(playerVM.currentChannel?.name ?? "")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)

                if let now = playerVM.epgSnapshot?.now {
                    Text(now.title)
                        .font(.caption)
                        .foregroundColor(.tiviMutedForeground)
                        .lineLimit(1)
                } else {
                    Text(locale.t("player.nowPlaying"))
                        .font(.caption)
                        .foregroundColor(.tiviMutedForeground)
                }
            }

            Spacer()

            Button {
                playerVM.stop()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(.tiviMutedForeground)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background {
            Capsule()
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                .overlay {
                    Capsule()
                        .strokeBorder(
                            LinearGradient(
                                colors: [
                                    .white.opacity(0.25),
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
        .onTapGesture {
            playerVM.isFullScreen = true
        }
    }
}
