import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus } from '../common/Theme';
import { RecentsViewModel } from '../viewmodels/RecentsViewModel';
import { RecentChannelInfo } from '../models/Types';

/**
 * Recents page showing recently watched channels as a list.
 * Each row shows channel name, play count, and last-watched time.
 */
@Component
export struct RecentsPage {
  onChannelClick: (channelId: number) => void = () => {};
  @State private vm: RecentsViewModel = new RecentsViewModel();

  aboutToAppear(): void {
    this.vm.loadRecents();
  }

  build() {
    Column() {
      // Page title
      Text($r('app.string.recents_title'))
        .fontSize(TiviTypo.h1Size)
        .fontWeight(TiviTypo.weightBold)
        .fontColor(TiviColors.foreground)

      // Loading
      if (this.vm.loading && this.vm.recents.length === 0) {
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
            .color(TiviColors.primary)
        }
        .width('100%')
        .margin({ top: 64 })
        .alignItems(HorizontalAlign.Center)
      }

      // Empty state
      if (this.vm.recents.length === 0 && !this.vm.loading) {
        Column() {
          SymbolGlyph($r('sys.symbol.clock'))
            .fontSize(TiviTypo.iconHugeSize)
            .fontColor([TiviColors.mutedForeground])
          Text($r('app.string.recents_empty'))
            .fontSize(TiviTypo.bodyLargeSize)
            .fontColor(TiviColors.mutedForeground)
            .margin({ top: TiviSpacing.base })
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .margin({ top: 64 })
        .alignItems(HorizontalAlign.Center)
      }

      // Recents list
      if (this.vm.recents.length > 0) {
        List({ space: TiviSpacing.sm }) {
          ForEach(this.vm.recents, (item: RecentChannelInfo) => {
            ListItem() {
              Row() {
                // Channel logo or icon
                if (item.logoUrl) {
                  Image(item.logoUrl)
                    .width(48)
                    .height(48)
                    .objectFit(ImageFit.Contain)
                    .borderRadius(TiviRadius.sm)
                } else {
                  SymbolGlyph($r('sys.symbol.tv'))
                    .fontSize(TiviTypo.iconLargishSize)
                    .fontColor([TiviColors.mutedForeground])
                    .width(48)
                    .height(48)
                }

                // Channel info
                Column() {
                  Text(item.name)
                    .fontSize(TiviTypo.h4Size)
                    .fontWeight(TiviTypo.weightSemibold)
                    .fontColor(TiviColors.foreground)
                    .maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })

                  Row({ space: TiviSpacing.base }) {
                    Text(`${item.playCount}x played`)
                      .fontSize(TiviTypo.smallSize)
                      .fontColor(TiviColors.mutedForeground)

                    Text(item.lastWatchedAt)
                      .fontSize(TiviTypo.smallSize)
                      .fontColor(TiviColors.mutedForeground)
                  }
                  .margin({ top: TiviSpacing.xs })
                }
                .alignItems(HorizontalAlign.Start)
                .margin({ left: TiviSpacing.base })
                .layoutWeight(1)

                // Favorite star
                if (item.isFavorite) {
                  SymbolGlyph($r('sys.symbol.star_fill'))
                    .fontSize(TiviTypo.iconMediumSize)
                    .fontColor([TiviColors.favorite])
                }
              }
              .width('100%')
              .padding(TiviSpacing.base)
              .backgroundColor(TiviColors.card)
              .borderRadius(TiviRadius.lg)
              .focusable(true)
              .onClick(() => {
                this.onChannelClick(item.id);
              })
              .stateStyles({
                focused: {
                  .border({
                    width: TiviFocus.borderWidth,
                    color: TiviColors.focusBorder,
                    style: BorderStyle.Solid
                  })
                  .scale({ x: 1.02, y: 1.02 })
                },
                normal: {
                  .border({ width: 1, color: TiviColors.border })
                  .scale({ x: 1.0, y: 1.0 })
                }
              })
              .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
            }
          }, (item: RecentChannelInfo) => item.id.toString())
        }
        .width('100%')
        .layoutWeight(1)
        .margin({ top: TiviSpacing.lg })
      }
    }
    .width('100%')
    .height('100%')
    .padding({
      left: TiviSpacing.safeAreaX,
      right: TiviSpacing.safeAreaX,
      top: TiviSpacing.safeAreaY,
      bottom: TiviSpacing.safeAreaY
    })
  }
}
