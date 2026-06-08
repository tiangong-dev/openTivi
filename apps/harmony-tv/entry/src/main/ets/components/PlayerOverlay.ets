import { TiviColors, TiviTypo, TiviSpacing, TiviRadius } from '../common/Theme';

/**
 * Player overlay UI shown when the user presses a D-pad button during playback.
 * Displays channel name, current/next EPG program info, and control hints.
 * Auto-hides after a timeout.
 */
@Component
export struct PlayerOverlay {
  @Prop channelName: string = '';
  @Prop currentProgram: string = '';
  @Prop nextProgram: string = '';
  @Prop isVisible: boolean = false;

  build() {
    if (this.isVisible) {
      Column() {
        // Top bar: channel name
        Row() {
          Text(this.channelName)
            .fontSize(TiviTypo.h1Size)
            .fontWeight(TiviTypo.weightBold)
            .fontColor(TiviColors.foreground)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          Blank()

          // Live indicator
          Row({ space: TiviSpacing.sm }) {
            Circle()
              .width(10)
              .height(10)
              .fill(TiviColors.live)
            Text('LIVE')
              .fontSize(TiviTypo.badgeSize)
              .fontWeight(TiviTypo.weightBold)
              .fontColor(TiviColors.live)
          }
        }
        .width('100%')
        .padding({
          left: TiviSpacing.safeAreaX,
          right: TiviSpacing.safeAreaX,
          top: TiviSpacing.safeAreaY
        })

        Blank()

        // Bottom bar: EPG info + controls hint
        Column() {
          // Current program
          if (this.currentProgram) {
            Row({ space: TiviSpacing.sm }) {
              Text($r('app.string.player_now'))
                .fontSize(TiviTypo.captionSize)
                .fontWeight(TiviTypo.weightSemibold)
                .fontColor(TiviColors.primary)
              Text(this.currentProgram)
                .fontSize(TiviTypo.bodyLargeSize)
                .fontColor(TiviColors.foreground)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }
            .margin({ bottom: TiviSpacing.sm })
          }

          // Next program
          if (this.nextProgram) {
            Row({ space: TiviSpacing.sm }) {
              Text($r('app.string.player_next'))
                .fontSize(TiviTypo.captionSize)
                .fontWeight(TiviTypo.weightSemibold)
                .fontColor(TiviColors.mutedForeground)
              Text(this.nextProgram)
                .fontSize(TiviTypo.bodySize)
                .fontColor(TiviColors.mutedForeground)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }
          }

          // No program info fallback
          if (!this.currentProgram && !this.nextProgram) {
            Text($r('app.string.player_no_program'))
              .fontSize(TiviTypo.bodySize)
              .fontColor(TiviColors.mutedForeground)
          }
        }
        .width('100%')
        .padding({
          left: TiviSpacing.safeAreaX,
          right: TiviSpacing.safeAreaX,
          bottom: TiviSpacing.safeAreaY
        })
        .linearGradient({
          direction: GradientDirection.Bottom,
          colors: [[TiviColors.transparent, 0.0], [TiviColors.overlayHeavy, 1.0]]
        })
        .padding({
          left: TiviSpacing.safeAreaX,
          right: TiviSpacing.safeAreaX,
          bottom: TiviSpacing.safeAreaY,
          top: TiviSpacing.xxl
        })
      }
      .width('100%')
      .height('100%')
      .linearGradient({
        direction: GradientDirection.Bottom,
        colors: [[TiviColors.overlayMedium, 0.0], [TiviColors.transparent, 0.3], [TiviColors.transparent, 0.7], [TiviColors.overlayMedium, 1.0]]
      })
    }
  }
}
