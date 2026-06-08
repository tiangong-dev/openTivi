import Foundation

extension SourceInfo: Identifiable {}

extension ChannelInfo: Identifiable {}

extension EpgProgramInfo: Identifiable {}

extension RecentChannelInfo: Identifiable {}

extension EpgSearchResult: Identifiable {}

extension SettingInfo: Identifiable {
    public var id: String { key }
}
