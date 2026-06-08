import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { ChannelLogo } from './ChannelLogo';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { LocaleHelper } from '../common/Locale';

@Component
export struct PlayerOverlay {
  @Link playerVM: PlayerViewModel;
  @Prop showOverlay: boolean = true;
  onDismiss: () => void = () => {};
  onLock: () => void = () => {};

  build() {
    if (this.showOverlay) {
      Stack() {
        // Background gradients
        Column() {
          // Top gradient
          Column()
            .width('100%')
            .height(120)
            .linearGradient({
              direction: GradientDirection.Bottom,
              colors: [[TiviColors.overlayGradientMedium, 0.0], ['#00000000', 1.0]]
            })

          Blank()

          // Bottom gradient
          Column()
            .width('100%')
            .height(200)
            .linearGradient({
              direction: GradientDirection.Top,
              colors: [[TiviColors.overlayGradientDark, 0.0], ['#00000000', 1.0]]
            })
        }
        .width('100%')
        .height('100%')

        // Controls layer
        Column() {
          // Top bar
          Row() {
            // Back/minimize button
            SymbolGlyph($r('sys.symbol.chevron_down_circle_fill'))
              .fontSize(32)
              .fontColor([TiviColors.overlayText])
              .onClick(() => {
                this.playerVM.minimize();
              })

            Blank()

            // Lock button
            SymbolGlyph($r('sys.symbol.lock_open'))
              .fontSize(24)
              .fontColor([TiviColors.overlayText])
              .padding(TiviSpacing.md)
              .backgroundColor(TiviColors.overlayButtonBg)
              .borderRadius(TiviRadius.full)
              .onClick(() => {
                this.onLock();
              })
          }
          .width('100%')
          .padding({ left: TiviSpacing.xl, right: TiviSpacing.xl, top: TiviSpacing.md })

          Blank()

          // Center play/pause
          Row({ space: TiviSpacing.xxxl }) {
            // Previous channel
            SymbolGlyph($r('sys.symbol.backward_end_fill'))
              .fontSize(28)
              .fontColor([this.playerVM.canGoPrevious() ? TiviColors.overlayText : TiviColors.overlayTextFaint])
              .onClick(async () => {
                if (this.playerVM.canGoPrevious()) {
                  await this.playerVM.previousChannel();
                }
              })

            // Play/Pause
            SymbolGlyph($r('sys.symbol.play_fill'))
              .fontSize(44)
              .fontColor([TiviColors.overlayText])

            // Next channel
            SymbolGlyph($r('sys.symbol.forward_end_fill'))
              .fontSize(28)
              .fontColor([this.playerVM.canGoNext() ? TiviColors.overlayText : TiviColors.overlayTextFaint])
              .onClick(async () => {
                if (this.playerVM.canGoNext()) {
                  await this.playerVM.nextChannel();
                }
              })
          }
          .justifyContent(FlexAlign.Center)

          Blank()

          // Bottom info panel
          Column({ space: TiviSpacing.sm }) {
            if (this.playerVM.currentChannel) {
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

            // EPG info
            if (this.playerVM.epgSnapshot?.now) {
              Row({ space: TiviSpacing.sm - 2 }) {
                Text($r('app.string.player_now'))
                  .fontSize(TiviTypography.badge)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(TiviColors.overlayText)
                  .padding({ left: 6, right: 6, top: 2, bottom: 2 })
                  .backgroundColor(TiviColors.lightLive)
                  .borderRadius(4)

                Text(this.playerVM.epgSnapshot!.now!.title)
                  .fontSize(TiviTypography.small)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(TiviColors.overlayText)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
                  .layoutWeight(1)
              }
              .width('100%')

              Text(`${LocaleHelper.formatXmltvTime(this.playerVM.epgSnapshot!.now!.startAt)} – ${LocaleHelper.formatXmltvTime(this.playerVM.epgSnapshot!.now!.endAt)}`)
                .fontSize(TiviTypography.caption)
                .fontColor(TiviColors.overlayTextDim)
            }

            if (this.playerVM.epgSnapshot?.next) {
              Row({ space: TiviSpacing.sm - 2 }) {
                Text($r('app.string.player_next'))
                  .fontSize(TiviTypography.badge)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(TiviColors.overlayTextMuted)
                  .padding({ left: 6, right: 6, top: 2, bottom: 2 })
                  .backgroundColor(TiviColors.overlayButtonBg)
                  .borderRadius(4)

                Text(this.playerVM.epgSnapshot!.next!.title)
                  .fontSize(TiviTypography.small)
                  .fontColor(TiviColors.overlayText)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
                  .layoutWeight(1)
              }
              .width('100%')
            }

            // Swipe hint
            Text($r('app.string.player_swipe_hint'))
              .fontSize(TiviTypography.caption)
              .fontColor(TiviColors.overlayTextSubtle)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding({ left: TiviSpacing.xl, right: TiviSpacing.xl, bottom: TiviSpacing.xxl })
        }
        .width('100%')
        .height('100%')
      }
      .width('100%')
      .height('100%')
    }
  }
}
