import { RustBridge } from '../bridge/RustBridge';
import { FavoriteGridItem, ChannelInfo, ChannelEpgSnapshot } from '../models/Types';
import { EPG_WINDOW_BACK_MS, EPG_WINDOW_FORWARD_MS } from '../common/Constants';

/**
 * ViewModel for the Favorites page. Loads favorite channels with EPG snapshots.
 */
@ObservedV2
export class FavoritesViewModel {
  @Trace favorites: FavoriteGridItem[] = [];
  @Trace loading: boolean = false;

  constructor() {
    this.loadFavorites();
  }

  async loadFavorites(): Promise<void> {
    this.loading = true;
    try {
      const list = await RustBridge.listFavorites();

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

      this.favorites = list.map((ch: ChannelInfo): FavoriteGridItem => ({
        channel: ch,
        nowTitle: byId.get(ch.id)?.now?.title
      }));
    } catch (_e) {
      this.favorites = [];
    } finally {
      this.loading = false;
    }
  }

  async removeFavorite(channelId: number): Promise<void> {
    try {
      await RustBridge.setFavorite(channelId, false);
      await this.loadFavorites();
    } catch (_e) {
      // Silently fail
    }
  }
}
