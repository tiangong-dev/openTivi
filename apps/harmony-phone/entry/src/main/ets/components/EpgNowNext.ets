import { ChannelEpgSnapshot } from '../models/Types';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { LocaleHelper } from '../common/Locale';

@Component
export struct EpgNowNext {
  @Prop snapshot: ChannelEpgSnapshot | undefined = undefined;

  build() {
    if (this.snapshot) {
      Column({ space: TiviSpacing.xs }) {
        if (this.snapshot!.now) {
          Row({ space: TiviSpacing.sm - 2 }) {
            Text($r('app.string.player_now'))
              .fontSize(TiviTypography.badge)
              .fontWeight(FontWeight.Bold)
              .fontColor(TiviColors.overlayText)
              .padding({ left: 4, right: 4, top: 1, bottom: 1 })
              .backgroundColor(TiviColors.lightLive)
              .borderRadius(3)

            Text(this.snapshot!.now!.title)
              .fontSize(TiviTypography.caption)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .layoutWeight(1)
          }
          .width('100%')
        }

        if (this.snapshot!.next) {
          Row({ space: TiviSpacing.sm - 2 }) {
            Text($r('app.string.player_next'))
              .fontSize(TiviTypography.badge)
              .fontWeight(FontWeight.Bold)
              .fontColor(TiviColors.lightMutedForeground)
              .padding({ left: 4, right: 4, top: 1, bottom: 1 })
              .backgroundColor(TiviColors.lightMuted)
              .borderRadius(3)

            Text(this.snapshot!.next!.title)
              .fontSize(TiviTypography.caption)
              .fontColor(TiviColors.lightMutedForeground)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .layoutWeight(1)
          }
          .width('100%')
        }
      }
      .alignItems(HorizontalAlign.Start)
    }
  }
}
