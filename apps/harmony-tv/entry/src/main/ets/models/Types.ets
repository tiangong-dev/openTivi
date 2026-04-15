/**
 * Data types matching the Rust core DTOs exposed via N-API bridge.
 * These mirror the structures in apps/android-tv/rust/src/lib.rs
 */

export interface SourceInfo {
  id: number;
  kind: string;
  name: string;
  location: string;
  username?: string;
  password?: string;
  enabled: boolean;
  disabledReason?: string;
  autoRefreshMinutes?: number;
  channelCount: number;
  groupCount: number;
  channelsWithTvgId: number;
  epgProgramCount: number;
  lastImportedAt?: string;
  lastRefreshError?: string;
  lastRefreshAttemptAt?: string;
  consecutiveRefreshFailures: number;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelInfo {
  id: number;
  sourceId: number;
  name: string;
  channelNumber?: string;
  groupName?: string;
  tvgId?: string;
  logoUrl?: string;
  streamUrl: string;
  isFavorite: boolean;
}

export interface EpgProgramMini {
  title: string;
  startAt: string;
  endAt: string;
}

export interface ChannelEpgSnapshot {
  channelId: number;
  now?: EpgProgramMini;
  next?: EpgProgramMini;
  timelinePrograms: EpgProgramMini[];
}

export interface ImportResult {
  sourceId: number;
  channelsImported: number;
  channelsUpdated: number;
  channelsRemoved: number;
}

export interface RecentChannelInfo {
  id: number;
  sourceId: number;
  name: string;
  channelNumber?: string;
  groupName?: string;
  tvgId?: string;
  logoUrl?: string;
  streamUrl: string;
  isFavorite: boolean;
  lastWatchedAt: string;
  playCount: number;
}

export interface SettingInfo {
  key: string;
  value: string;
  updatedAt: string;
}

export interface PlaybackInfo {
  channelId: number;
  resolvedChannelId: number;
  sourceId: number;
  channelName: string;
  streamUrl: string;
  logoUrl?: string;
}

export interface ChannelGridItem {
  channel: ChannelInfo;
  nowTitle?: string;
}

export interface FavoriteGridItem {
  channel: ChannelInfo;
  nowTitle?: string;
}

/** Navigation tab identifiers */
export enum NavTab {
  Home = 0,
  Channels = 1,
  Favorites = 2,
  Recents = 3,
  Sources = 4,
  Settings = 5
}
