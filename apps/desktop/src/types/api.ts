export interface Source {
  id: number;
  kind: "m3u" | "xtream" | "xmltv";
  name: string;
  location: string;
  username?: string;
  password?: string;
  enabled: boolean;
  autoRefreshMinutes?: number;
  channelCount: number;
  groupCount: number;
  channelsWithTvgId: number;
  epgProgramCount: number;
  lastImportedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
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

export interface EpgProgram {
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

export interface ImportSummary {
  sourceId: number;
  channelsImported: number;
  channelsUpdated: number;
  channelsRemoved: number;
}

export interface RecentChannel extends Channel {
  lastWatchedAt: string;
  playCount: number;
}

export interface Setting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  publishedAt?: string;
}
