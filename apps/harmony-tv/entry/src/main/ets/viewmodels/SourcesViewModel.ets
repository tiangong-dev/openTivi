import { RustBridge } from '../bridge/RustBridge';
import { SourceInfo, ImportResult } from '../models/Types';

/**
 * ViewModel for the Sources page. Manages IPTV source import, refresh, deletion.
 */
@ObservedV2
export class SourcesViewModel {
  @Trace sources: SourceInfo[] = [];
  @Trace busy: boolean = false;
  @Trace message: string | undefined = undefined;

  constructor() {
    this.loadSources();
  }

  async loadSources(): Promise<void> {
    try {
      this.sources = await RustBridge.listSources();
    } catch (e) {
      this.message = String(e);
    }
  }

  async importM3u(name: string, url: string): Promise<void> {
    this.busy = true;
    this.message = undefined;
    try {
      const result: ImportResult = await RustBridge.importM3u(name, url);
      this.message = `Imported ${result.channelsImported} channels`;
      await this.loadSources();
    } catch (e) {
      this.message = `Import failed: ${String(e)}`;
    } finally {
      this.busy = false;
    }
  }

  async importXtream(name: string, server: string, username: string,
    password: string): Promise<void> {
    this.busy = true;
    this.message = undefined;
    try {
      const result: ImportResult = await RustBridge.importXtream(name, server, username, password);
      this.message = `Imported ${result.channelsImported} channels`;
      await this.loadSources();
    } catch (e) {
      this.message = `Import failed: ${String(e)}`;
    } finally {
      this.busy = false;
    }
  }

  async importXmltv(name: string, location: string): Promise<void> {
    this.busy = true;
    this.message = undefined;
    try {
      await RustBridge.importXmltv(name, location);
      this.message = 'XMLTV imported successfully';
      await this.loadSources();
    } catch (e) {
      this.message = `Import failed: ${String(e)}`;
    } finally {
      this.busy = false;
    }
  }

  async refreshSource(sourceId: number): Promise<void> {
    this.busy = true;
    this.message = undefined;
    try {
      const result: ImportResult = await RustBridge.refreshSource(sourceId);
      this.message = `Refreshed: +${result.channelsImported} channels`;
      await this.loadSources();
    } catch (e) {
      this.message = `Refresh failed: ${String(e)}`;
    } finally {
      this.busy = false;
    }
  }

  async deleteSource(sourceId: number): Promise<void> {
    this.busy = true;
    this.message = undefined;
    try {
      await RustBridge.deleteSource(sourceId);
      await this.loadSources();
    } catch (e) {
      this.message = `Delete failed: ${String(e)}`;
    } finally {
      this.busy = false;
    }
  }

  clearMessage(): void {
    this.message = undefined;
  }
}
