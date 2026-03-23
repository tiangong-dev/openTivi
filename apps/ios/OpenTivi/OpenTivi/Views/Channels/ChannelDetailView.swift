import SwiftUI

struct ChannelDetailView: View {
    let channel: ChannelInfo
    @EnvironmentObject var playerVM: PlayerViewModel
    @ObservedObject private var locale = LocaleManager.shared

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

            Section(locale.t("channels.detail.actions")) {
                Button {
                    playerVM.play(channel: channel)
                } label: {
                    Label(locale.t("channels.detail.play"), systemImage: "play.fill")
                }
            }

            if let number = channel.channelNumber {
                Section(locale.t("channels.detail.info")) {
                    LabeledContent(locale.t("channels.detail.channelNumber"), value: number)
                }
            }
        }
        .navigationTitle(channel.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
