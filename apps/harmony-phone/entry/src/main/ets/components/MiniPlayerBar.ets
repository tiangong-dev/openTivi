import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { ChannelLogo } from './ChannelLogo';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { AppConstants } from '../common/Constants';

@Component
export struct MiniPlayerBar {
  @Link playerVM: PlayerViewModel;

  build() {
    if (this.playerVM.isPlaying && !this.playerVM.isFullScreen) {
      Row({ space: TiviSpacing.md }) {
        ChannelLogo({
          url: this.playerVM.currentChannel?.logoUrl ?? '',
          size: 40
        })

        Column({ space: 2 }) {
          Text(this.playerVM.currentChannel?.name ?? '')
            .fontSize(TiviTypography.small)
            .fontWeight(FontWeight.Medium)
            .fontColor(TiviColors.overlayText)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          Text($r('app.string.player_now_playing'))
            .fontSize(TiviTypography.badge)
            .fontColor(TiviColors.overlayTextDim)
            .maxLines(1)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)

        // Play/Pause indicator
        SymbolGlyph($r('sys.symbol.play_fill'))
          .fontSize(TiviTypography.h3)
          .fontColor([TiviColors.overlayText])

        // Close button
        SymbolGlyph($r('sys.symbol.xmark'))
          .fontSize(TiviTypography.bodyLarge)
          .fontColor([TiviColors.overlayTextDim])
          .onClick(() => {
            this.playerVM.stop();
          })
      }
      .width('100%')
      .height(AppConstants.MINI_PLAYER_HEIGHT)
      .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg })
      .backgroundColor(TiviColors.overlayBg)
      .backdropBlur(20)
      .borderRadius({ topLeft: TiviRadius.lg, topRight: TiviRadius.lg })
      .onClick(() => {
        this.playerVM.expand();
      })
      .transition(TransitionEffect.move(TransitionEdge.BOTTOM).animation({
        duration: AppConstants.ANIM_SLOW,
        curve: Curve.EaseOut
      }))
    }
  }
}
