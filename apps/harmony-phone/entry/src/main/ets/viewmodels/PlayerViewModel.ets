import { ChannelInfo, ChannelEpgSnapshot, EpgProgramInfo } from '../models/Types';
import { RustBridge } from '../bridge/RustBridge';

@ObservedV2
export class PlayerViewModel {
  @Trace currentChannel: ChannelInfo | undefined = undefined;
  @Trace isPlaying: boolean = false;
  @Trace isFullScreen: boolean = false;
  @Trace epgSnapshot: ChannelEpgSnapshot | undefined = undefined;
  @Trace channelList: ChannelInfo[] = [];
  @Trace isLocked: boolean = false;
  @Trace streamUrl: string = '';
  @Trace isBuffering: boolean = false;
  @Trace errorMessage: string = '';

  async play(channel: ChannelInfo, allChannels?: ChannelInfo[]): Promise<void> {
    this.currentChannel = channel;
    this.isPlaying = true;
    this.isFullScreen = true;
    this.isBuffering = true;
    this.errorMessage = '';

    if (allChannels) {
      this.channelList = allChannels;
    }

    try {
      const playback = await RustBridge.shared().resolvePlayback(channel.id);
      this.streamUrl = playback.streamUrl;
      this.isBuffering = false;
    } catch (e) {
      // Fallback to channel's own stream URL
      this.streamUrl = channel.streamUrl;
      this.isBuffering = false;
    }

    try {
      await RustBridge.shared().markRecentWatched(channel.id);
    } catch (e) {
      // Non-critical
    }

    await this.loadEpg(channel.id);
  }

  stop(): void {
    this.isPlaying = false;
    this.isFullScreen = false;
    this.currentChannel = undefined;
    this.epgSnapshot = undefined;
    this.streamUrl = '';
    this.isBuffering = false;
    this.errorMessage = '';
    this.isLocked = false;
  }

  minimize(): void {
    this.isFullScreen = false;
  }

  expand(): void {
    if (this.isPlaying) {
      this.isFullScreen = true;
    }
  }

  currentChannelIndex(): number {
    if (!this.currentChannel) return -1;
    return this.channelList.findIndex((c) => c.id === this.currentChannel!.id);
  }

  canGoNext(): boolean {
    const idx = this.currentChannelIndex();
    return idx >= 0 && idx + 1 < this.channelList.length;
  }

  canGoPrevious(): boolean {
    const idx = this.currentChannelIndex();
    return idx > 0;
  }

  async nextChannel(): Promise<void> {
    const idx = this.currentChannelIndex();
    if (idx >= 0 && idx + 1 < this.channelList.length) {
      await this.play(this.channelList[idx + 1]);
    }
  }

  async previousChannel(): Promise<void> {
    const idx = this.currentChannelIndex();
    if (idx > 0) {
      await this.play(this.channelList[idx - 1]);
    }
  }

  getNextChannel(): ChannelInfo | undefined {
    const idx = this.currentChannelIndex();
    if (idx >= 0 && idx + 1 < this.channelList.length) {
      return this.channelList[idx + 1];
    }
    return undefined;
  }

  getPreviousChannel(): ChannelInfo | undefined {
    const idx = this.currentChannelIndex();
    if (idx > 0) {
      return this.channelList[idx - 1];
    }
    return undefined;
  }

  private async loadEpg(channelId: number): Promise<void> {
    try {
      const programs = await RustBridge.shared().getChannelEpg(channelId);
      if (programs.length > 0) {
        const now = new Date();
        let nowProgram: { title: string; startAt: string; endAt: string } | undefined;
        let nextProgram: { title: string; startAt: string; endAt: string } | undefined;

        for (let i = 0; i < programs.length; i++) {
          const p = programs[i];
          const start = new Date(p.startAt);
          const end = new Date(p.endAt);
          if (start <= now && end > now) {
            nowProgram = { title: p.title, startAt: p.startAt, endAt: p.endAt };
            if (i + 1 < programs.length) {
              const n = programs[i + 1];
              nextProgram = { title: n.title, startAt: n.startAt, endAt: n.endAt };
            }
            break;
          }
        }

        this.epgSnapshot = {
          channelId: channelId,
          now: nowProgram,
          next: nextProgram,
          timelinePrograms: programs.map((p) => ({
            title: p.title,
            startAt: p.startAt,
            endAt: p.endAt
          }))
        };
      } else {
        this.epgSnapshot = undefined;
      }
    } catch (e) {
      this.epgSnapshot = undefined;
    }
  }
}
