/**
 * N-API bridge to the Rust opentivi-core library.
 *
 * At build time the Rust crate is compiled to a .so via napi-ohos and linked
 * into the HAP.  This file declares the JS-side bindings that map 1-to-1 to
 * the #[napi] exports in rust/src/lib.rs.
 *
 * All bridge functions are async (return Promise) because the Rust side uses
 * a Tokio runtime and runs DB / network calls off the main thread.
 */
import {
  SourceInfo,
  ChannelInfo,
  ChannelEpgSnapshot,
  ImportResult,
  RecentChannelInfo,
  SettingInfo,
  PlaybackInfo
} from '../models/Types';

/**
 * The native module loaded via N-API. In HarmonyOS this is loaded
 * with the standard `import nativeModule from 'libopentivi.so'` syntax
 * once the .so is bundled into the HAP's libs/ directory.
 *
 * During development before the native .so is available, we provide a
 * mock fallback so the UI can be developed and tested independently.
 */
let nativeModule: NativeBridge | undefined;

try {
  // HarmonyOS N-API native module import
  // The .so file must be placed in entry/libs/<arch>/libopentivi.so
  nativeModule = globalThis.__loadNativeModule__?.('libopentivi') as NativeBridge;
} catch (e) {
  console.warn('[RustBridge] Native module not available, using mock bridge');
}

interface NativeBridge {
  initEngine(dataDir: string): Promise<number>;
  listSources(): Promise<SourceInfo[]>;
  importM3u(name: string, location: string, autoRefreshMinutes?: number): Promise<ImportResult>;
  importXtream(name: string, serverUrl: string, username: string, password: string): Promise<ImportResult>;
  importXmltv(name: string, location: string): Promise<ImportResult>;
  refreshSource(sourceId: number): Promise<ImportResult>;
  updateSource(sourceId: number, name: string, location: string,
    username?: string, password?: string, autoRefreshMinutes?: number, enabled: boolean): Promise<void>;
  deleteSource(sourceId: number): Promise<void>;
  listChannels(sourceId?: number, groupName?: string, search?: string,
    favoritesOnly?: boolean, limit?: number, offset?: number): Promise<ChannelInfo[]>;
  listGroups(sourceId?: number): Promise<string[]>;
  getChannelsEpgSnapshots(channelIds: number[], windowStartTs?: number,
    windowEndTs?: number): Promise<ChannelEpgSnapshot[]>;
  listFavorites(): Promise<ChannelInfo[]>;
  setFavorite(channelId: number, favorite: boolean): Promise<void>;
  listRecents(): Promise<RecentChannelInfo[]>;
  markRecentWatched(channelId: number): Promise<void>;
  resolvePlayback(channelId: number): Promise<PlaybackInfo>;
  getAllSettings(): Promise<SettingInfo[]>;
  setSetting(key: string, value: string): Promise<void>;
  getProxyPort(): Promise<number>;
}

/**
 * Singleton bridge providing async access to the Rust core engine.
 * If the native module is unavailable, methods return sensible defaults
 * so the UI layer can still be developed and tested without the native build.
 */
export class RustBridge {
  private static proxyPort: number = 0;
  private static initialized: boolean = false;

  /** Initialize the Rust engine. Must be called once at app startup. */
  static async initEngine(dataDir: string): Promise<number> {
    if (RustBridge.initialized) {
      return RustBridge.proxyPort;
    }
    if (nativeModule) {
      RustBridge.proxyPort = await nativeModule.initEngine(dataDir);
    } else {
      console.warn('[RustBridge] initEngine: native module not loaded');
      RustBridge.proxyPort = 0;
    }
    RustBridge.initialized = true;
    return RustBridge.proxyPort;
  }

  static getProxyPort(): number {
    return RustBridge.proxyPort;
  }

  // ── Sources ──────────────────────────────────────────────────────────

  static async listSources(): Promise<SourceInfo[]> {
    if (!nativeModule) return [];
    return nativeModule.listSources();
  }

  static async importM3u(name: string, location: string,
    autoRefreshMinutes?: number): Promise<ImportResult> {
    if (!nativeModule) {
      throw new Error('Native module not available');
    }
    return nativeModule.importM3u(name, location, autoRefreshMinutes);
  }

  static async importXtream(name: string, serverUrl: string,
    username: string, password: string): Promise<ImportResult> {
    if (!nativeModule) {
      throw new Error('Native module not available');
    }
    return nativeModule.importXtream(name, serverUrl, username, password);
  }

  static async importXmltv(name: string, location: string): Promise<ImportResult> {
    if (!nativeModule) {
      throw new Error('Native module not available');
    }
    return nativeModule.importXmltv(name, location);
  }

  static async refreshSource(sourceId: number): Promise<ImportResult> {
    if (!nativeModule) {
      throw new Error('Native module not available');
    }
    return nativeModule.refreshSource(sourceId);
  }

  static async deleteSource(sourceId: number): Promise<void> {
    if (!nativeModule) {
      throw new Error('Native module not available');
    }
    return nativeModule.deleteSource(sourceId);
  }

  // ── Channels ─────────────────────────────────────────────────────────

  static async listChannels(sourceId?: number, groupName?: string,
    search?: string, favoritesOnly?: boolean,
    limit: number = 5000, offset: number = 0): Promise<ChannelInfo[]> {
    if (!nativeModule) return [];
    return nativeModule.listChannels(sourceId, groupName, search,
      favoritesOnly, limit, offset);
  }

  static async listGroups(sourceId?: number): Promise<string[]> {
    if (!nativeModule) return [];
    return nativeModule.listGroups(sourceId);
  }

  // ── EPG ──────────────────────────────────────────────────────────────

  static async getChannelsEpgSnapshots(channelIds: number[],
    windowStartTs?: number, windowEndTs?: number): Promise<ChannelEpgSnapshot[]> {
    if (!nativeModule) return [];
    return nativeModule.getChannelsEpgSnapshots(channelIds, windowStartTs, windowEndTs);
  }

  // ── Favorites ────────────────────────────────────────────────────────

  static async listFavorites(): Promise<ChannelInfo[]> {
    if (!nativeModule) return [];
    return nativeModule.listFavorites();
  }

  static async setFavorite(channelId: number, favorite: boolean): Promise<void> {
    if (!nativeModule) return;
    return nativeModule.setFavorite(channelId, favorite);
  }

  // ── Recents ──────────────────────────────────────────────────────────

  static async listRecents(): Promise<RecentChannelInfo[]> {
    if (!nativeModule) return [];
    return nativeModule.listRecents();
  }

  static async markRecentWatched(channelId: number): Promise<void> {
    if (!nativeModule) return;
    return nativeModule.markRecentWatched(channelId);
  }

  // ── Playback ─────────────────────────────────────────────────────────

  static async resolvePlayback(channelId: number): Promise<PlaybackInfo> {
    if (!nativeModule) {
      throw new Error('Native module not available');
    }
    return nativeModule.resolvePlayback(channelId);
  }

  // ── Settings ─────────────────────────────────────────────────────────

  static async getAllSettings(): Promise<SettingInfo[]> {
    if (!nativeModule) return [];
    return nativeModule.getAllSettings();
  }

  static async setSetting(key: string, value: string): Promise<void> {
    if (!nativeModule) return;
    return nativeModule.setSetting(key, value);
  }
}
