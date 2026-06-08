import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { PlayerView } from '../views/PlayerView';
import { router } from '@kit.ArkUI';
import { window } from '@kit.ArkUI';

@Entry
@Component
struct PlayerPage {
  @State playerVM: PlayerViewModel = new PlayerViewModel();

  aboutToAppear(): void {
    // Try to get the shared PlayerViewModel instance
    // In production, use AppStorage or a global state management solution
    const params = router.getParams() as Record<string, Object> | undefined;
    if (params && params['playerVM']) {
      this.playerVM = params['playerVM'] as PlayerViewModel;
    }

    // Request landscape orientation for player
    this.setLandscape();
  }

  aboutToDisappear(): void {
    // Restore portrait orientation
    this.setPortrait();
  }

  private async setLandscape(): Promise<void> {
    try {
      const win = await window.getLastWindow(getContext(this));
      await win.setPreferredOrientation(window.Orientation.AUTO_ROTATION);
      await win.setWindowSystemBarEnable([]);
    } catch (e) {
      console.warn('Failed to set landscape orientation:', JSON.stringify(e));
    }
  }

  private async setPortrait(): Promise<void> {
    try {
      const win = await window.getLastWindow(getContext(this));
      await win.setPreferredOrientation(window.Orientation.PORTRAIT);
      await win.setWindowSystemBarEnable(['status', 'navigation']);
    } catch (e) {
      console.warn('Failed to set portrait orientation:', JSON.stringify(e));
    }
  }

  build() {
    Column() {
      PlayerView({ playerVM: $playerVM })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
  }

  onBackPress(): boolean {
    if (this.playerVM.isFullScreen) {
      this.playerVM.minimize();
      router.back();
      return true;
    }
    return false;
  }
}
