import { ChannelInfo } from '../models/Types';
import { RustBridge } from '../bridge/RustBridge';

@ObservedV2
export class ChannelsViewModel {
  @Trace channels: ChannelInfo[] = [];
  @Trace groups: string[] = [];
  @Trace selectedGroup: string | undefined = undefined;
  @Trace searchText: string = '';
  @Trace isLoading: boolean = false;

  get filteredChannels(): ChannelInfo[] {
    let result = this.channels;
    if (this.selectedGroup) {
      const group = this.selectedGroup;
      result = result.filter((c) => c.groupName === group);
    }
    if (this.searchText.length > 0) {
      const query = this.searchText.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(query));
    }
    return result;
  }

  async loadChannels(): Promise<void> {
    this.isLoading = true;
    try {
      this.channels = await RustBridge.shared().listChannels();
    } catch (e) {
      console.error('ChannelsViewModel.loadChannels failed:', JSON.stringify(e));
    } finally {
      this.isLoading = false;
    }
  }

  async loadGroups(): Promise<void> {
    try {
      this.groups = await RustBridge.shared().listGroups();
    } catch (e) {
      console.error('ChannelsViewModel.loadGroups failed:', JSON.stringify(e));
    }
  }

  async toggleFavorite(channelId: number): Promise<void> {
    const index = this.channels.findIndex((c) => c.id === channelId);
    if (index < 0) return;

    const newValue = !this.channels[index].isFavorite;
    // Optimistic update
    const updated = [...this.channels];
    updated[index] = { ...updated[index], isFavorite: newValue };
    this.channels = updated;

    try {
      await RustBridge.shared().setFavorite(channelId, newValue);
    } catch (e) {
      // Revert on failure
      const reverted = [...this.channels];
      const idx = reverted.findIndex((c) => c.id === channelId);
      if (idx >= 0) {
        reverted[idx] = { ...reverted[idx], isFavorite: !newValue };
        this.channels = reverted;
      }
    }
  }

  selectGroup(group: string | undefined): void {
    this.selectedGroup = group;
  }
}
