import { RustBridge } from '../bridge/RustBridge';
import { ChannelInfo, PlaybackInfo, ChannelEpgSnapshot } from '../models/Types';
import { EPG_WINDOW_BACK_MS, EPG_WINDOW_FORWARD_MS, CHANNEL_PAGE_LIMIT } from '../common/Constants';

/**
 * ViewModel for the Player page. Manages playback state, channel switching,
 * and EPG info for the currently playing channel.
 */
@ObservedV2
export class PlayerViewModel {
  @Trace channelName: string = '';
  @Trace currentProgram: string | undefined = undefined;
  @Trace nextProgram: string | undefined = undefined;
  @Trace streamUrl: string = '';
  @Trace logoUrl: string | undefined = undefined;
  @Trace isLoading: boolean = false;
  @Trace error: string | undefined = undefined;

  private orderedChannels: ChannelInfo[] = [];
  private currentIndex: number = 0;
  private currentChannelId: number = 0;

  async loadChannel(channelId: number): Promise<void> {
    this.isLoading = true;
    this.error = undefined;
    this.currentChannelId = channelId;
    try {
      // Mark as recently watched
      RustBridge.markRecentWatched(channelId).catch(() => {});

      // Resolve playback URL
      const playback: PlaybackInfo = await RustBridge.resolvePlayback(channelId);

      // Load all channels for prev/next navigation
      const allChannels = await RustBridge.listChannels(
        undefined, undefined, undefined, false, CHANNEL_PAGE_LIMIT, 0
      );
      this.orderedChannels = allChannels;
      this.currentIndex = Math.max(0, allChannels.findIndex(ch => ch.id === channelId));

      this.channelName = playback.channelName;
      this.streamUrl = playback.streamUrl;
      this.logoUrl = playback.logoUrl;

      // Load EPG data
      await this.refreshEpg(channelId);
    } catch (e) {
      this.error = String(e);
      this.channelName = '';
      this.currentProgram = undefined;
      this.nextProgram = undefined;
    } finally {
      this.isLoading = false;
    }
  }

  private async refreshEpg(channelId: number): Promise<void> {
    try {
      const now = Date.now();
      const snaps = await RustBridge.getChannelsEpgSnapshots(
        [channelId],
        now - EPG_WINDOW_BACK_MS,
        now + EPG_WINDOW_FORWARD_MS
      );
      const snap: ChannelEpgSnapshot | undefined = snaps[0];
      this.currentProgram = snap?.now?.title;
      this.nextProgram = snap?.next?.title;
    } catch (_e) {
      this.currentProgram = undefined;
      this.nextProgram = undefined;
    }
  }

  async switchToPreviousChannel(): Promise<void> {
    if (this.currentIndex <= 0) return;
    this.currentIndex--;
    const prev = this.orderedChannels[this.currentIndex];
    if (prev) {
      await this.switchToChannel(prev.id);
    }
  }

  async switchToNextChannel(): Promise<void> {
    if (this.currentIndex + 1 >= this.orderedChannels.length) return;
    this.currentIndex++;
    const next = this.orderedChannels[this.currentIndex];
    if (next) {
      await this.switchToChannel(next.id);
    }
  }

  private async switchToChannel(channelId: number): Promise<void> {
    this.currentChannelId = channelId;
    try {
      RustBridge.markRecentWatched(channelId).catch(() => {});
      const playback: PlaybackInfo = await RustBridge.resolvePlayback(channelId);
      this.channelName = playback.channelName;
      this.streamUrl = playback.streamUrl;
      this.logoUrl = playback.logoUrl;
      await this.refreshEpg(channelId);
    } catch (_e) {
      // Silently fail channel switch
    }
  }

  getCurrentChannelId(): number {
    return this.currentChannelId;
  }
}
