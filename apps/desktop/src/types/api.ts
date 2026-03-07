export interface Source {
  id: number;
  kind: "m3u" | "xtream" | "xmltv";
  name: string;
  location: string;
  username?: string;
  password?: string;
  enabled: boolean;
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
  valueJson: unknown;
  updatedAt: string;
}
