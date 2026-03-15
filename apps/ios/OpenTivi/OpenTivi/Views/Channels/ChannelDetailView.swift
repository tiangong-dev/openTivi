import SwiftUI

struct ChannelDetailView: View {
    let channel: ChannelInfo
    @EnvironmentObject var playerVM: PlayerViewModel

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    ChannelLogo(url: channel.logoUrl, size: 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(channel.name).font(.title2).fontWeight(.bold)
                        if let group = channel.groupName {
                            Text(group).font(.subheadline).foregroundColor(.secondary)
                        }
                    }
                }
                .listRowBackground(Color.clear)
            }

            Section("Actions") {
                Button {
                    playerVM.play(channel: channel)
                } label: {
                    Label("Play", systemImage: "play.fill")
                }
            }

            if let number = channel.channelNumber {
                Section("Info") {
                    LabeledContent("Channel Number", value: number)
                }
            }
        }
        .navigationTitle(channel.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
