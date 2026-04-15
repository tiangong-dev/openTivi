import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { RustBridge } from '../bridge/RustBridge';

const TAG = 'EntryAbility';
const DOMAIN = 0x0000;

export default class EntryAbility extends UIAbility {
  async onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): Promise<void> {
    hilog.info(DOMAIN, TAG, 'onCreate');

    // Initialize the Rust engine with the app's files directory
    try {
      const dataDir = this.context.filesDir;
      hilog.info(DOMAIN, TAG, `Initializing engine with data dir: ${dataDir}`);
      const proxyPort = await RustBridge.initEngine(dataDir);
      hilog.info(DOMAIN, TAG, `Engine initialized, proxy port: ${proxyPort}`);
    } catch (e) {
      hilog.error(DOMAIN, TAG, `Failed to initialize engine: ${e}`);
    }
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onDestroy');
  }

  async onWindowStageCreate(windowStage: window.WindowStage): Promise<void> {
    hilog.info(DOMAIN, TAG, 'onWindowStageCreate');

    // Set the window to full-screen immersive mode for TV
    try {
      const mainWindow = await windowStage.getMainWindow();
      await mainWindow.setWindowLayoutFullScreen(true);
      // Hide system bars for TV immersive experience
      await mainWindow.setWindowSystemBarEnable([]);
    } catch (e) {
      hilog.error(DOMAIN, TAG, `Failed to set fullscreen: ${e}`);
    }

    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, `Failed to load content: ${JSON.stringify(err)}`);
        return;
      }
      hilog.info(DOMAIN, TAG, 'Content loaded successfully');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, 'onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, 'onForeground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, 'onBackground');
  }
}
