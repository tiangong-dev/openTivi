import SwiftUI

struct EpgNowNextView: View {
    let snapshot: ChannelEpgSnapshot?
    @ObservedObject private var locale = LocaleManager.shared

    var body: some View {
        if let snapshot = snapshot {
            VStack(alignment: .leading, spacing: 4) {
                if let now = snapshot.now {
                    HStack(spacing: 6) {
                        Text(locale.t("player.now").uppercased())
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(.tiviLive)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .overlay(
                                RoundedRectangle(cornerRadius: 3)
                                    .strokeBorder(Color.tiviLive, lineWidth: 1)
                            )

                        Text(now.title)
                            .font(.caption)
                            .lineLimit(1)
                    }
                }

                if let next = snapshot.next {
                    HStack(spacing: 6) {
                        Text(locale.t("player.next").uppercased())
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(.tiviMutedForeground)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.tiviMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 3))

                        Text(next.title)
                            .font(.caption)
                            .foregroundColor(.tiviMutedForeground)
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}
