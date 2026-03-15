import SwiftUI

struct EpgNowNextView: View {
    let snapshot: ChannelEpgSnapshot?

    var body: some View {
        if let snapshot = snapshot {
            VStack(alignment: .leading, spacing: 4) {
                if let now = snapshot.now {
                    HStack(spacing: 6) {
                        Text("NOW")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.red)
                            .clipShape(RoundedRectangle(cornerRadius: 3))

                        Text(now.title)
                            .font(.caption)
                            .lineLimit(1)
                    }
                }

                if let next = snapshot.next {
                    HStack(spacing: 6) {
                        Text("NEXT")
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundColor(.secondary)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color(.systemGray5))
                            .clipShape(RoundedRectangle(cornerRadius: 3))

                        Text(next.title)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}
