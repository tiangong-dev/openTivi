import SwiftUI

struct PlayerOverlay: View {
    @EnvironmentObject var playerVM: PlayerViewModel

    var body: some View {
        VStack {
            // Top: close button
            HStack {
                Button {
                    playerVM.isFullScreen = false
                } label: {
                    Image(systemName: "chevron.down.circle.fill")
                        .font(.title)
                        .foregroundColor(.white)
                }
                Spacer()
            }
            .padding()

            Spacer()

            // Bottom: channel info + EPG
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
                            Text("NOW")
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
                            Text("NEXT")
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

                // Swipe hints
                Text("Swipe up/down to switch channels · Swipe down to close")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.5))
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(
                    colors: [.clear, .black.opacity(0.8)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
    }
}
