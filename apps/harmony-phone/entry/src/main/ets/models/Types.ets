// Data models matching the Rust N-API bridge types

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

export interface EpgProgramInfo {
  id: number;
  channelTvgId: string;
  startAt: string;
  endAt: string;
  title: string;
  description?: string;
  category?: string;
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

export interface EpgSearchResult {
  id: number;
  channelId: number;
  sourceId: number;
  channelName: string;
  channelNumber?: string;
  channelTvgId: string;
  startAt: string;
  endAt: string;
  title: string;
  description?: string;
  category?: string;
}
