import { RustBridge } from '../bridge/RustBridge';
import { ChannelGridItem, ChannelInfo, ChannelEpgSnapshot } from '../models/Types';
import { CHANNEL_PAGE_LIMIT, EPG_WINDOW_BACK_MS, EPG_WINDOW_FORWARD_MS } from '../common/Constants';

/**
 * ViewModel for the Channels page. Manages channel list, group filtering,
 * and search. Mirrors Android TV ChannelsViewModel pattern.
 */
@ObservedV2
export class ChannelsViewModel {
  @Trace channels: ChannelGridItem[] = [];
  @Trace groups: string[] = [];
  @Trace selectedGroup: string | undefined = undefined;
  @Trace searchQuery: string = '';
  @Trace loading: boolean = false;
  @Trace error: string | undefined = undefined;

  constructor() {
    this.refreshAll();
  }

  async refreshAll(): Promise<void> {
    this.loading = true;
    this.error = undefined;
    try {
      this.groups = await RustBridge.listGroups();
      await this.loadChannels();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }

  async selectGroup(group: string | undefined): Promise<void> {
    this.selectedGroup = group;
    await this.loadChannels();
  }

  async setSearchQuery(query: string): Promise<void> {
    this.searchQuery = query;
    await this.loadChannels();
  }

  async loadChannels(): Promise<void> {
    this.loading = true;
    this.error = undefined;
    try {
      const search = this.searchQuery.trim() || undefined;
      const list = await RustBridge.listChannels(
        undefined, this.selectedGroup, search, false,
        CHANNEL_PAGE_LIMIT, 0
      );

      let snapshots: ChannelEpgSnapshot[] = [];
      if (list.length > 0) {
        const now = Date.now();
        snapshots = await RustBridge.getChannelsEpgSnapshots(
          list.map(ch => ch.id),
          now - EPG_WINDOW_BACK_MS,
          now + EPG_WINDOW_FORWARD_MS
        );
      }

      const byId = new Map<number, ChannelEpgSnapshot>();
      for (const snap of snapshots) {
        byId.set(snap.channelId, snap);
      }

      this.channels = list.map((ch: ChannelInfo): ChannelGridItem => {
        const snap = byId.get(ch.id);
        return {
          channel: ch,
          nowTitle: snap?.now?.title
        };
      });
    } catch (e) {
      this.error = String(e);
      this.channels = [];
    } finally {
      this.loading = false;
    }
  }

  async toggleFavorite(channelId: number, favorite: boolean): Promise<void> {
    try {
      await RustBridge.setFavorite(channelId, favorite);
      await this.loadChannels();
    } catch (_e) {
      // Silently fail
    }
  }
}
