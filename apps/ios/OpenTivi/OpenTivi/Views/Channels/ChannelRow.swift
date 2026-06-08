import SwiftUI

struct ChannelRow: View {
    let channel: ChannelInfo

    var body: some View {
        HStack(spacing: 12) {
            ChannelLogo(url: channel.logoUrl, size: 48)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(channel.name)
                        .font(.tiviH4)
                        .lineLimit(1)

                    if channel.isFavorite {
                        Image(systemName: "star.fill")
                            .foregroundColor(.tiviFavorite)
                            .font(.caption2)
                    }
                }

                if let group = channel.groupName, !group.isEmpty {
                    Text(group)
                        .font(.tiviCaption)
                        .foregroundColor(.tiviMutedForeground)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let number = channel.channelNumber, !number.isEmpty {
                Text(number)
                    .font(.tiviCaption)
                    .foregroundColor(.tiviMutedForeground)
                    .monospacedDigit()
            }

            Image(systemName: "play.circle")
                .font(.title3)
                .foregroundColor(.tiviPrimary)
        }
        .padding(.vertical, 4)
    }
}
