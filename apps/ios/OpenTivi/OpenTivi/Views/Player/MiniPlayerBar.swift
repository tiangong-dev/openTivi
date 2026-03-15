import SwiftUI

struct MiniPlayerBar: View {
    @EnvironmentObject var playerVM: PlayerViewModel

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
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                } else {
                    Text("Now playing")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            Button {
                playerVM.stop()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 4)
        .padding(.horizontal, 8)
        .onTapGesture {
            playerVM.isFullScreen = true
        }
        .fullScreenCover(isPresented: $playerVM.isFullScreen) {
            PlayerView().environmentObject(playerVM)
        }
    }
}
