import { RecentsViewModel } from '../viewmodels/RecentsViewModel';
import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { ChannelInfo, RecentChannelInfo } from '../models/Types';
import { ChannelLogo } from '../components/ChannelLogo';
import { TiviColors, TiviTypography, TiviSpacing } from '../common/Theme';
import { AppConstants } from '../common/Constants';
import { LocaleHelper } from '../common/Locale';

@Component
export struct RecentsView {
  @Link playerVM: PlayerViewModel;
  @State vm: RecentsViewModel = new RecentsViewModel();

  aboutToAppear(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    await this.vm.load();
  }

  build() {
    Column() {
      // Title
      Text($r('app.string.recents_title'))
        .fontSize(TiviTypography.h1)
        .fontWeight(FontWeight.Bold)
        .width('100%')
        .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.md, bottom: TiviSpacing.md })

      if (this.vm.isLoading && this.vm.recents.length === 0) {
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else if (this.vm.recents.length === 0 && !this.vm.isLoading) {
        // Empty state
        Column({ space: TiviSpacing.md }) {
          SymbolGlyph($r('sys.symbol.clock'))
            .fontSize(32)
            .fontColor([TiviColors.lightMutedForeground])

          Text($r('app.string.recents_no_recents'))
            .fontSize(TiviTypography.h3)
            .fontWeight(FontWeight.Medium)

          Text($r('app.string.recents_watch_hint'))
            .fontSize(TiviTypography.small)
            .fontColor(TiviColors.lightMutedForeground)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else {
        Refresh({ refreshing: $$this.vm.isLoading }) {
          List() {
            ForEach(this.vm.recents, (recent: RecentChannelInfo) => {
              ListItem() {
                Row({ space: TiviSpacing.md }) {
                  ChannelLogo({
                    url: recent.logoUrl ?? '',
                    size: 44
                  })

                  Column({ space: 2 }) {
                    Text(recent.name)
                      .fontSize(TiviTypography.h4)
                      .fontWeight(FontWeight.Medium)
                      .maxLines(1)
                      .textOverflow({ overflow: TextOverflow.Ellipsis })

                    Row({ space: TiviSpacing.sm }) {
                      Text(LocaleHelper.relativeTime(recent.lastWatchedAt))
                        .fontSize(TiviTypography.caption)
                        .fontColor(TiviColors.lightMutedForeground)

                      Text('\u00B7')
                        .fontColor(TiviColors.lightMutedForeground)

                      Text(`${recent.playCount}x`)
                        .fontSize(TiviTypography.caption)
                        .fontColor(TiviColors.lightMutedForeground)
                    }
                  }
                  .layoutWeight(1)
                  .alignItems(HorizontalAlign.Start)

                  SymbolGlyph($r('sys.symbol.play_circle'))
                    .fontSize(24)
                    .fontColor([TiviColors.lightPrimary])
                }
                .width('100%')
                .padding({ top: 8, bottom: 8, left: TiviSpacing.lg, right: TiviSpacing.lg })
                .onClick(async () => {
                  const channel: ChannelInfo = {
                    id: recent.id,
                    sourceId: recent.sourceId,
                    name: recent.name,
                    channelNumber: recent.channelNumber,
                    groupName: recent.groupName,
                    tvgId: recent.tvgId,
                    logoUrl: recent.logoUrl,
                    streamUrl: recent.streamUrl,
                    isFavorite: recent.isFavorite
                  };
                  await this.playerVM.play(channel);
                })
              }
            }, (recent: RecentChannelInfo) => recent.id.toString())
          }
          .width('100%')
          .layoutWeight(1)
          .divider({
            strokeWidth: 0.5,
            color: TiviColors.lightBorder,
            startMargin: TiviSpacing.lg + 44 + TiviSpacing.md,
            endMargin: TiviSpacing.lg
          })
        }
        .onRefreshing(async () => {
          await this.loadData();
        })
        .layoutWeight(1)
      }
    }
    .width('100%')
    .height('100%')
  }
}
