import { RustBridge } from '../bridge/RustBridge';
import { RecentChannelInfo } from '../models/Types';

/**
 * ViewModel for the Recents page. Loads recently watched channels.
 */
@ObservedV2
export class RecentsViewModel {
  @Trace recents: RecentChannelInfo[] = [];
  @Trace loading: boolean = false;

  constructor() {
    this.loadRecents();
  }

  async loadRecents(): Promise<void> {
    this.loading = true;
    try {
      this.recents = await RustBridge.listRecents();
    } catch (_e) {
      this.recents = [];
    } finally {
      this.loading = false;
    }
  }
}
