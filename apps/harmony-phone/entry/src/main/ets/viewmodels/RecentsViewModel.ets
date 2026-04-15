import { RecentChannelInfo } from '../models/Types';
import { RustBridge } from '../bridge/RustBridge';

@ObservedV2
export class RecentsViewModel {
  @Trace recents: RecentChannelInfo[] = [];
  @Trace isLoading: boolean = false;

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.recents = await RustBridge.shared().listRecents();
    } catch (e) {
      console.error('RecentsViewModel.load failed:', JSON.stringify(e));
    } finally {
      this.isLoading = false;
    }
  }
}
