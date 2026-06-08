import { TiviColors, TiviTypo, TiviSpacing } from '../common/Theme';
import { PlayerOverlay } from '../components/PlayerOverlay';
import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { PLAYER_OVERLAY_TIMEOUT, CHANNEL_NUMBER_INPUT_TIMEOUT } from '../common/Constants';
import router from '@ohos.router';

/**
 * Full-screen video player page with overlay controls.
 * Uses HarmonyOS AVPlayer for video playback. The overlay appears
 * on any D-pad input and auto-hides after a timeout.
 *
 * D-pad controls:
 * - Up/Down: switch to previous/next channel
 * - OK/Enter: show/hide overlay
 * - Back: return to previous page
 * - Number keys: quick channel number entry
 */
@Entry
@Component
struct PlayerPage {
  @State private vm: PlayerViewModel = new PlayerViewModel();
  @State private showOverlay: boolean = true;
  @State private channelNumberInput: string = '';
  private overlayTimer: number = -1;
  private channelNumberTimer: number = -1;
  private xComponentController: XComponentController = new XComponentController();

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, number>;
    const channelId = params?.channelId;
    if (channelId) {
      this.vm.loadChannel(channelId);
    }
    this.startOverlayTimer();
  }

  aboutToDisappear(): void {
    this.clearOverlayTimer();
    this.clearChannelNumberTimer();
  }

  build() {
    Stack() {
      // Video surface
      XComponent({
        id: 'playerSurface',
        type: XComponentType.SURFACE,
        controller: this.xComponentController
      })
        .width('100%')
        .height('100%')
        .onLoad(() => {
          // In a full implementation, the surfaceId would be passed
          // to AVPlayer for video rendering
          const surfaceId = this.xComponentController.getXComponentSurfaceId();
          this.initPlayer(surfaceId);
        })

      // Loading state
      if (this.vm.isLoading) {
        Column() {
          LoadingProgress()
            .width(64)
            .height(64)
            .color(TiviColors.primary)
          Text($r('app.string.player_loading'))
            .fontSize(TiviTypo.bodyLargeSize)
            .fontColor(TiviColors.foreground)
            .margin({ top: TiviSpacing.base })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor(TiviColors.overlayHeavy)
      }

      // Error state
      if (this.vm.error) {
        Column() {
          SymbolGlyph($r('sys.symbol.exclamationmark_triangle'))
            .fontSize(TiviTypo.iconXLargeSize)
            .fontColor([TiviColors.destructiveForeground])
          Text(this.vm.error)
            .fontSize(TiviTypo.bodySize)
            .fontColor(TiviColors.destructiveForeground)
            .margin({ top: TiviSpacing.base })
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .backgroundColor(TiviColors.overlayHeavy)
      }

      // Player overlay (shown on D-pad input)
      PlayerOverlay({
        channelName: this.vm.channelName,
        currentProgram: this.vm.currentProgram || '',
        nextProgram: this.vm.nextProgram || '',
        isVisible: this.showOverlay
      })

      // Channel number input display (for quick number-pad switching)
      if (this.channelNumberInput) {
        Text(this.channelNumberInput)
          .fontSize(TiviTypo.displaySize)
          .fontWeight(TiviTypo.weightBold)
          .fontColor(TiviColors.foreground)
          .backgroundColor(TiviColors.overlayMedium)
          .padding({
            left: TiviSpacing.lg,
            right: TiviSpacing.lg,
            top: TiviSpacing.md,
            bottom: TiviSpacing.md
          })
          .borderRadius(12)
          .position({ x: '80%', y: '10%' })
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(TiviColors.background)
    .focusable(true)
    .defaultFocus(true)
    .onKeyEvent((event: KeyEvent) => {
      if (event.type === KeyType.Down) {
        this.handleKeyDown(event.keyCode);
      }
    })
  }

  private initPlayer(surfaceId: string): void {
    // In a full implementation, this would create an AVPlayer instance,
    // set the surface, and start playback with this.vm.streamUrl.
    // The proxy port from RustBridge.getProxyPort() would be used
    // to rewrite stream URLs through the local proxy.
    //
    // Example:
    // import { media } from '@kit.MediaKit';
    // const avPlayer = await media.createAVPlayer();
    // avPlayer.surfaceId = surfaceId;
    // avPlayer.url = this.vm.streamUrl;
    // await avPlayer.prepare();
    // await avPlayer.play();
    console.info(`[PlayerPage] initPlayer surfaceId=${surfaceId}, url=${this.vm.streamUrl}`);
  }

  private handleKeyDown(keyCode: number): void {
    // Show overlay on any key press and reset timer
    this.showOverlay = true;
    this.startOverlayTimer();

    switch (keyCode) {
      case 19: // KEYCODE_DPAD_UP — previous channel
        this.vm.switchToPreviousChannel();
        break;
      case 20: // KEYCODE_DPAD_DOWN — next channel
        this.vm.switchToNextChannel();
        break;
      case 23: // KEYCODE_DPAD_CENTER / Enter — toggle overlay
        // Already shown above; timer will auto-hide
        break;
      case 4: // KEYCODE_BACK — go back
        this.clearOverlayTimer();
        router.back();
        break;
      default:
        // Number keys 0-9 (keyCodes 7-16) for quick channel switching
        if (keyCode >= 7 && keyCode <= 16) {
          const digit = keyCode - 7;
          this.handleNumberInput(digit);
        }
        break;
    }
  }

  private handleNumberInput(digit: number): void {
    this.channelNumberInput += digit.toString();
    this.clearChannelNumberTimer();

    this.channelNumberTimer = setTimeout(() => {
      // After timeout, try to switch to the entered channel number
      // This would need to look up the channel by number
      this.channelNumberInput = '';
    }, CHANNEL_NUMBER_INPUT_TIMEOUT) as number;
  }

  private startOverlayTimer(): void {
    this.clearOverlayTimer();
    this.overlayTimer = setTimeout(() => {
      this.showOverlay = false;
    }, PLAYER_OVERLAY_TIMEOUT) as number;
  }

  private clearOverlayTimer(): void {
    if (this.overlayTimer >= 0) {
      clearTimeout(this.overlayTimer);
      this.overlayTimer = -1;
    }
  }

  private clearChannelNumberTimer(): void {
    if (this.channelNumberTimer >= 0) {
      clearTimeout(this.channelNumberTimer);
      this.channelNumberTimer = -1;
    }
  }
}
