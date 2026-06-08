import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { ChannelInfo } from '../models/Types';
import { PlayerOverlay } from '../components/PlayerOverlay';
import { ChannelLogo } from '../components/ChannelLogo';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { AppConstants } from '../common/Constants';

@Component
export struct PlayerView {
  @Link playerVM: PlayerViewModel;
  @State showOverlay: boolean = true;
  @State isLocked: boolean = false;
  @State dragOffsetY: number = 0;
  @State isChannelTransitioning: boolean = false;
  private overlayTimerId: number = -1;
  private lockedOverlayTimerId: number = -1;
  @State showLockedOverlay: boolean = false;

  aboutToAppear(): void {
    this.scheduleHideOverlay();
  }

  aboutToDisappear(): void {
    clearTimeout(this.overlayTimerId);
    clearTimeout(this.lockedOverlayTimerId);
  }

  build() {
    Stack() {
      // Black background
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Black)

      // Previous channel preview (above)
      if (this.playerVM.getPreviousChannel() && this.dragOffsetY > 0) {
        this.ChannelPreviewPage(this.playerVM.getPreviousChannel()!)
          .offset({ y: -this.getPageHeight() + this.dragOffsetY })
      }

      // Current playback page
      Stack() {
        // Video player area (placeholder for AVPlayer XComponent)
        Column() {
          if (this.playerVM.isBuffering) {
            LoadingProgress()
              .width(48)
              .height(48)
              .color(TiviColors.overlayText)
          } else if (this.playerVM.streamUrl.length > 0) {
            // In production, this would be an XComponent with AVPlayer
            // XComponent({ id: 'player', type: 'surface' })
            //   .width('100%')
            //   .height('100%')
            Column() {
              ChannelLogo({
                url: this.playerVM.currentChannel?.logoUrl ?? '',
                size: AppConstants.LOGO_SIZE_XL
              })
              Text(this.playerVM.currentChannel?.name ?? '')
                .fontSize(TiviTypography.h2)
                .fontWeight(FontWeight.Bold)
                .fontColor(TiviColors.overlayText)
                .margin({ top: TiviSpacing.lg })
              Text(this.playerVM.streamUrl)
                .fontSize(TiviTypography.caption)
                .fontColor(TiviColors.overlayTextSubtle)
                .margin({ top: TiviSpacing.sm })
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .constraintSize({ maxWidth: '80%' })
            }
            .justifyContent(FlexAlign.Center)
            .alignItems(HorizontalAlign.Center)
          }
        }
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Black)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)

        // Touch detection for overlay toggle
        Column()
          .width('100%')
          .height('100%')
          .onClick(() => {
            if (this.isLocked) {
              this.showLockedOverlay = !this.showLockedOverlay;
              if (this.showLockedOverlay) {
                this.scheduleLockedOverlayHide();
              }
            } else {
              this.showOverlay = !this.showOverlay;
              if (this.showOverlay) {
                this.scheduleHideOverlay();
              }
            }
          })

        // Locked overlay
        if (this.isLocked && this.showLockedOverlay) {
          this.LockedOverlay()
        }

        // Normal overlay
        if (!this.isLocked) {
          PlayerOverlay({
            playerVM: $playerVM,
            showOverlay: this.showOverlay,
            onDismiss: () => {
              this.showOverlay = false;
            },
            onLock: () => {
              this.isLocked = true;
              this.showOverlay = false;
            }
          })
        }
      }
      .width('100%')
      .height('100%')
      .offset({ y: this.dragOffsetY })

      // Next channel preview (below)
      if (this.playerVM.getNextChannel() && this.dragOffsetY < 0) {
        this.ChannelPreviewPage(this.playerVM.getNextChannel()!)
          .offset({ y: this.getPageHeight() + this.dragOffsetY })
      }
    }
    .width('100%')
    .height('100%')
    .clip(true)
    .gesture(
      PanGesture({ direction: PanDirection.Vertical, distance: 12 })
        .onActionUpdate((event: GestureEvent) => {
          if (this.isLocked || this.isChannelTransitioning) return;
          const dy = event.offsetY;
          const hasNext = this.playerVM.canGoNext();
          const hasPrev = this.playerVM.canGoPrevious();

          // Rubber band effect when no channel available
          if (dy < 0 && !hasNext) {
            this.dragOffsetY = dy * 0.28;
          } else if (dy > 0 && !hasPrev) {
            this.dragOffsetY = dy * 0.28;
          } else {
            this.dragOffsetY = dy;
          }
        })
        .onActionEnd(async (event: GestureEvent) => {
          if (this.isLocked || this.isChannelTransitioning) return;
          await this.handleSwipeEnd(event);
        })
    )
  }

  @Builder
  ChannelPreviewPage(channel: ChannelInfo) {
    Column({ space: TiviSpacing.lg }) {
      ChannelLogo({
        url: channel.logoUrl ?? '',
        size: AppConstants.LOGO_SIZE_XL
      })
      Text(channel.name)
        .fontSize(TiviTypography.h3)
        .fontWeight(FontWeight.Medium)
        .fontColor(TiviColors.overlayText)
        .textAlign(TextAlign.Center)
        .padding({ left: TiviSpacing.xxl, right: TiviSpacing.xxl })
      if (channel.groupName) {
        Text(channel.groupName!)
          .fontSize(TiviTypography.small)
          .fontColor(TiviColors.overlayTextMuted)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Black)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  LockedOverlay() {
    Stack() {
      // Background gradient
      Column() {
        Column()
          .width('100%')
          .height(120)
          .linearGradient({
            direction: GradientDirection.Bottom,
            colors: [[TiviColors.overlayGradientMedium, 0.0], ['#00000000', 1.0]]
          })
        Blank()
      }
      .width('100%')
      .height('100%')

      Column() {
        // Unlock button at top-left
        Row() {
          SymbolGlyph($r('sys.symbol.lock_fill'))
            .fontSize(28)
            .fontColor([TiviColors.overlayText])
            .padding(TiviSpacing.md)
            .backgroundColor(TiviColors.overlayButtonBg)
            .borderRadius(TiviRadius.full)
            .backdropBlur(10)
            .onClick(() => {
              this.isLocked = false;
              this.showLockedOverlay = false;
              this.showOverlay = true;
              this.scheduleHideOverlay();
            })
          Blank()
        }
        .width('100%')
        .padding({ left: TiviSpacing.xl, top: TiviSpacing.md })

        Blank()

        // Channel info at bottom
        if (this.playerVM.currentChannel) {
          Column({ space: TiviSpacing.sm }) {
            Text(this.playerVM.currentChannel!.name)
              .fontSize(TiviTypography.h2)
              .fontWeight(FontWeight.Bold)
              .fontColor(TiviColors.overlayText)
            if (this.playerVM.currentChannel!.groupName) {
              Text(this.playerVM.currentChannel!.groupName!)
                .fontSize(TiviTypography.small)
                .fontColor(TiviColors.overlayTextDim)
            }
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding({ left: TiviSpacing.xl, right: TiviSpacing.xl, bottom: TiviSpacing.xxl })
        }
      }
      .width('100%')
      .height('100%')
    }
    .width('100%')
    .height('100%')
    .transition(TransitionEffect.opacity(1).animation({ duration: AppConstants.ANIM_BASE }))
  }

  private getPageHeight(): number {
    // Default full screen height; in production use display.getDefaultDisplay()
    return 812;
  }

  private async handleSwipeEnd(event: GestureEvent): Promise<void> {
    const dy = this.dragOffsetY;
    const threshold = Math.max(72, this.getPageHeight() * 0.16);

    if (dy < -threshold && this.playerVM.canGoNext()) {
      this.isChannelTransitioning = true;
      animateTo({
        duration: AppConstants.ANIM_SLOW,
        curve: Curve.EaseOut,
        onFinish: async () => {
          await this.playerVM.nextChannel();
          this.dragOffsetY = 0;
          this.isChannelTransitioning = false;
        }
      }, () => {
        this.dragOffsetY = -this.getPageHeight();
      });
    } else if (dy > threshold && this.playerVM.canGoPrevious()) {
      this.isChannelTransitioning = true;
      animateTo({
        duration: AppConstants.ANIM_SLOW,
        curve: Curve.EaseOut,
        onFinish: async () => {
          await this.playerVM.previousChannel();
          this.dragOffsetY = 0;
          this.isChannelTransitioning = false;
        }
      }, () => {
        this.dragOffsetY = this.getPageHeight();
      });
    } else {
      // Snap back
      animateTo({
        duration: AppConstants.ANIM_BASE,
        curve: Curve.EaseOut
      }, () => {
        this.dragOffsetY = 0;
      });
    }
  }

  private scheduleHideOverlay(): void {
    clearTimeout(this.overlayTimerId);
    this.overlayTimerId = setTimeout(() => {
      this.showOverlay = false;
    }, AppConstants.OVERLAY_HIDE_DELAY);
  }

  private scheduleLockedOverlayHide(): void {
    clearTimeout(this.lockedOverlayTimerId);
    this.lockedOverlayTimerId = setTimeout(() => {
      this.showLockedOverlay = false;
    }, AppConstants.OVERLAY_HIDE_DELAY);
  }
}
