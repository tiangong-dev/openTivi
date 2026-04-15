import { ChannelInfo } from '../models/Types';
import { RustBridge } from '../bridge/RustBridge';

@ObservedV2
export class FavoritesViewModel {
  @Trace favorites: ChannelInfo[] = [];
  @Trace isLoading: boolean = false;

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.favorites = await RustBridge.shared().listFavorites();
    } catch (e) {
      console.error('FavoritesViewModel.load failed:', JSON.stringify(e));
    } finally {
      this.isLoading = false;
    }
  }

  async removeFavorite(channelId: number): Promise<void> {
    try {
      await RustBridge.shared().setFavorite(channelId, false);
      this.favorites = this.favorites.filter((c) => c.id !== channelId);
    } catch (e) {
      console.error('FavoritesViewModel.removeFavorite failed:', JSON.stringify(e));
    }
  }
}
