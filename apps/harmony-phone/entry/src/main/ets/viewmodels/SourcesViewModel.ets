import { SourceInfo, ImportResult } from '../models/Types';
import { RustBridge } from '../bridge/RustBridge';

@ObservedV2
export class SourcesViewModel {
  @Trace sources: SourceInfo[] = [];
  @Trace isLoading: boolean = false;
  @Trace importMessage: string = '';

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.sources = await RustBridge.shared().listSources();
    } catch (e) {
      console.error('SourcesViewModel.load failed:', JSON.stringify(e));
    } finally {
      this.isLoading = false;
    }
  }

  async importM3u(name: string, location: string, autoRefreshMinutes: number | null): Promise<void> {
    try {
      const result = await RustBridge.shared().importM3u(name, location, autoRefreshMinutes);
      this.importMessage = `Imported ${result.channelsImported} channels`;
      await this.load();
    } catch (e) {
      this.importMessage = `Import failed: ${JSON.stringify(e)}`;
    }
  }

  async importXtream(name: string, serverUrl: string, username: string, password: string): Promise<void> {
    try {
      const result = await RustBridge.shared().importXtream(name, serverUrl, username, password);
      this.importMessage = `Imported ${result.channelsImported} channels`;
      await this.load();
    } catch (e) {
      this.importMessage = `Import failed: ${JSON.stringify(e)}`;
    }
  }

  async importXmltv(name: string, location: string): Promise<void> {
    try {
      const result = await RustBridge.shared().importXmltv(name, location);
      this.importMessage = `Imported ${result.channelsImported} channels`;
      await this.load();
    } catch (e) {
      this.importMessage = `Import failed: ${JSON.stringify(e)}`;
    }
  }

  async deleteSource(sourceId: number): Promise<void> {
    try {
      await RustBridge.shared().deleteSource(sourceId);
      this.sources = this.sources.filter((s) => s.id !== sourceId);
    } catch (e) {
      this.importMessage = `Delete failed: ${JSON.stringify(e)}`;
    }
  }

  async refreshSource(sourceId: number): Promise<void> {
    try {
      const result = await RustBridge.shared().refreshSource(sourceId);
      this.importMessage = `Refreshed: +${result.channelsImported} channels`;
      await this.load();
    } catch (e) {
      this.importMessage = `Refresh failed: ${JSON.stringify(e)}`;
    }
  }

  async refreshAllSources(): Promise<void> {
    for (const source of this.sources) {
      try {
        await RustBridge.shared().refreshSource(source.id);
      } catch (e) {
        console.error(`Refresh source ${source.name} failed:`, JSON.stringify(e));
      }
    }
    await this.load();
  }

  async updateSource(sourceId: number, name: string, location: string,
    username: string | null, password: string | null,
    autoRefreshMinutes: number | null, enabled: boolean): Promise<void> {
    try {
      await RustBridge.shared().updateSource(sourceId, name, location, username, password, autoRefreshMinutes, enabled);
      this.importMessage = 'Source updated.';
      await this.load();
    } catch (e) {
      this.importMessage = `Update failed: ${JSON.stringify(e)}`;
    }
  }
}
