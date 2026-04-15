// N-API bridge to Rust opentivi-core.
// In production, these functions are implemented by the native .so library
// loaded via N-API. This file declares the interface and provides a typed
// wrapper that the ArkTS layer consumes.

import {
  SourceInfo,
  ChannelInfo,
  ImportResult,
  RecentChannelInfo,
  SettingInfo,
  PlaybackInfo,
  ChannelEpgSnapshot,
  EpgProgramInfo,
  EpgSearchResult
} from '../models/Types';

// N-API native module — loaded from libopentivi_harmony.so
// In DevEco, configure the native library in CMakeLists and oh-package.json5.
// The actual native functions are declared here for type safety.

interface NativeEngine {
  initEngine(dataDir: string): number; // returns proxy port
  listSources(): SourceInfo[];
  importM3u(name: string, location: string, autoRefreshMinutes: number | null): ImportResult;
  importXtream(name: string, serverUrl: string, username: string, password: string): ImportResult;
  importXmltv(name: string, location: string): ImportResult;
  refreshSource(sourceId: number): ImportResult;
  updateSource(sourceId: number, name: string, location: string,
    username: string | null, password: string | null,
    autoRefreshMinutes: number | null, enabled: boolean): void;
  deleteSource(sourceId: number): void;
  listChannels(sourceId: number | null, groupName: string | null,
    search: string | null, favoritesOnly: boolean | null,
    limit: number, offset: number): ChannelInfo[];
  listGroups(sourceId: number | null): string[];
  getChannel(channelId: number): ChannelInfo | null;
  getChannelEpg(channelId: number, fromTs: string | null, toTs: string | null): EpgProgramInfo[];
  getChannelsEpgSnapshots(channelIds: number[],
    windowStartTs: number | null, windowEndTs: number | null): ChannelEpgSnapshot[];
  searchEpg(search: string | null, state: string | null, limit: number | null): EpgSearchResult[];
  listFavorites(): ChannelInfo[];
  setFavorite(channelId: number, favorite: boolean): void;
  listRecents(): RecentChannelInfo[];
  markRecentWatched(channelId: number): void;
  resolvePlayback(channelId: number): PlaybackInfo;
  listPlaybackCandidates(channelId: number): PlaybackInfo[];
  getAllSettings(): SettingInfo[];
  setSetting(key: string, value: string): void;
  getProxyPort(): number;
}

// Attempt to load the native module. Falls back to a stub for development.
let nativeModule: NativeEngine | undefined;

try {
  // @ts-ignore — native module loaded at runtime
  nativeModule = globalThis.requireNapi?.('opentivi_harmony') as NativeEngine;
} catch (e) {
  console.warn('RustBridge: Native module not available, using stubs');
}

export class RustBridge {
  private static instance: RustBridge | undefined;
  private proxyPort: number = 0;
  private initialized: boolean = false;

  static shared(): RustBridge {
    if (!RustBridge.instance) {
      RustBridge.instance = new RustBridge();
    }
    return RustBridge.instance;
  }

  async initEngine(dataDir: string): Promise<number> {
    if (this.initialized) {
      return this.proxyPort;
    }
    if (nativeModule) {
      this.proxyPort = nativeModule.initEngine(dataDir);
      this.initialized = true;
      return this.proxyPort;
    }
    console.warn('RustBridge.initEngine: stub mode');
    this.initialized = true;
    return 0;
  }

  async listSources(): Promise<SourceInfo[]> {
    if (nativeModule) {
      return nativeModule.listSources();
    }
    return [];
  }

  async importM3u(name: string, location: string, autoRefreshMinutes: number | null): Promise<ImportResult> {
    if (nativeModule) {
      return nativeModule.importM3u(name, location, autoRefreshMinutes);
    }
    return { sourceId: 0, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0 };
  }

  async importXtream(name: string, serverUrl: string, username: string, password: string): Promise<ImportResult> {
    if (nativeModule) {
      return nativeModule.importXtream(name, serverUrl, username, password);
    }
    return { sourceId: 0, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0 };
  }

  async importXmltv(name: string, location: string): Promise<ImportResult> {
    if (nativeModule) {
      return nativeModule.importXmltv(name, location);
    }
    return { sourceId: 0, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0 };
  }

  async refreshSource(sourceId: number): Promise<ImportResult> {
    if (nativeModule) {
      return nativeModule.refreshSource(sourceId);
    }
    return { sourceId: 0, channelsImported: 0, channelsUpdated: 0, channelsRemoved: 0 };
  }

  async updateSource(sourceId: number, name: string, location: string,
    username: string | null, password: string | null,
    autoRefreshMinutes: number | null, enabled: boolean): Promise<void> {
    if (nativeModule) {
      nativeModule.updateSource(sourceId, name, location, username, password, autoRefreshMinutes, enabled);
    }
  }

  async deleteSource(sourceId: number): Promise<void> {
    if (nativeModule) {
      nativeModule.deleteSource(sourceId);
    }
  }

  async listChannels(sourceId: number | null = null, groupName: string | null = null,
    search: string | null = null, favoritesOnly: boolean | null = null,
    limit: number = 10000, offset: number = 0): Promise<ChannelInfo[]> {
    if (nativeModule) {
      return nativeModule.listChannels(sourceId, groupName, search, favoritesOnly, limit, offset);
    }
    return [];
  }

  async listGroups(sourceId: number | null = null): Promise<string[]> {
    if (nativeModule) {
      return nativeModule.listGroups(sourceId);
    }
    return [];
  }

  async getChannel(channelId: number): Promise<ChannelInfo | null> {
    if (nativeModule) {
      return nativeModule.getChannel(channelId);
    }
    return null;
  }

  async getChannelEpg(channelId: number, fromTs: string | null = null,
    toTs: string | null = null): Promise<EpgProgramInfo[]> {
    if (nativeModule) {
      return nativeModule.getChannelEpg(channelId, fromTs, toTs);
    }
    return [];
  }

  async getChannelsEpgSnapshots(channelIds: number[],
    windowStartTs: number | null = null,
    windowEndTs: number | null = null): Promise<ChannelEpgSnapshot[]> {
    if (nativeModule) {
      return nativeModule.getChannelsEpgSnapshots(channelIds, windowStartTs, windowEndTs);
    }
    return [];
  }

  async listFavorites(): Promise<ChannelInfo[]> {
    if (nativeModule) {
      return nativeModule.listFavorites();
    }
    return [];
  }

  async setFavorite(channelId: number, favorite: boolean): Promise<void> {
    if (nativeModule) {
      nativeModule.setFavorite(channelId, favorite);
    }
  }

  async listRecents(): Promise<RecentChannelInfo[]> {
    if (nativeModule) {
      return nativeModule.listRecents();
    }
    return [];
  }

  async markRecentWatched(channelId: number): Promise<void> {
    if (nativeModule) {
      nativeModule.markRecentWatched(channelId);
    }
  }

  async resolvePlayback(channelId: number): Promise<PlaybackInfo> {
    if (nativeModule) {
      return nativeModule.resolvePlayback(channelId);
    }
    return { channelId: 0, resolvedChannelId: 0, sourceId: 0, channelName: '', streamUrl: '' };
  }

  async getAllSettings(): Promise<SettingInfo[]> {
    if (nativeModule) {
      return nativeModule.getAllSettings();
    }
    return [];
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (nativeModule) {
      nativeModule.setSetting(key, value);
    }
  }

  async getProxyPort(): Promise<number> {
    if (nativeModule) {
      return nativeModule.getProxyPort();
    }
    return 0;
  }
}
