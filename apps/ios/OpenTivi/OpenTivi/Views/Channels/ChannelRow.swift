import SwiftUI

struct ChannelRow: View {
    let channel: ChannelInfo

    var body: some View {
        HStack(spacing: 12) {
            ChannelLogo(url: channel.logoUrl, size: 48)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(channel.name)
                        .font(.body)
                        .fontWeight(.medium)
                        .lineLimit(1)

                    if channel.isFavorite {
                        Image(systemName: "star.fill")
                            .foregroundColor(.yellow)
                            .font(.caption2)
                    }
                }

                if let group = channel.groupName, !group.isEmpty {
                    Text(group)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let number = channel.channelNumber, !number.isEmpty {
                Text(number)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .monospacedDigit()
            }

            Image(systemName: "play.circle")
                .font(.title3)
                .foregroundColor(.accentColor)
        }
        .padding(.vertical, 4)
    }
}
