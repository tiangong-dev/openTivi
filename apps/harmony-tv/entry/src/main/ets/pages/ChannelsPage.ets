import { TiviColors, TiviTypo, TiviSpacing } from '../common/Theme';
import { ChannelCard } from '../components/ChannelCard';
import { GroupChips } from '../components/GroupChips';
import { ChannelsViewModel } from '../viewmodels/ChannelsViewModel';
import { ChannelGridItem } from '../models/Types';
import { CHANNEL_GRID_COLUMNS } from '../common/Constants';

/**
 * Channel grid page with group filtering. Displays channels as focusable
 * cards in a 4-column grid. Mirrors Android TV ChannelsScreen.
 */
@Component
export struct ChannelsPage {
  onChannelClick: (channelId: number) => void = () => {};
  @State private vm: ChannelsViewModel = new ChannelsViewModel();

  aboutToAppear(): void {
    this.vm.refreshAll();
  }

  build() {
    Column() {
      // Page title
      Text($r('app.string.nav_channels'))
        .fontSize(TiviTypo.h1Size)
        .fontWeight(TiviTypo.weightBold)
        .fontColor(TiviColors.foreground)

      // Error message
      if (this.vm.error) {
        Text(this.vm.error)
          .fontSize(TiviTypo.bodySize)
          .fontColor(TiviColors.destructiveForeground)
          .backgroundColor(TiviColors.destructive)
          .padding(TiviSpacing.sm)
          .borderRadius(6)
          .margin({ top: TiviSpacing.sm })
      }

      // Group filter chips
      GroupChips({
        groups: this.vm.groups,
        selectedGroup: this.vm.selectedGroup || '',
        onGroupSelected: (group: string | undefined) => {
          this.vm.selectGroup(group);
        }
      })
        .margin({ top: TiviSpacing.lg })

      // Empty state
      if (this.vm.channels.length === 0 && !this.vm.loading && !this.vm.error) {
        Column() {
          SymbolGlyph($r('sys.symbol.tv'))
            .fontSize(TiviTypo.iconHugeSize)
            .fontColor([TiviColors.mutedForeground])
          Text($r('app.string.channels_empty'))
            .fontSize(TiviTypo.bodyLargeSize)
            .fontColor(TiviColors.mutedForeground)
            .margin({ top: TiviSpacing.base })
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .margin({ top: 64 })
        .alignItems(HorizontalAlign.Center)
      }

      // Loading indicator
      if (this.vm.loading && this.vm.channels.length === 0) {
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
            .color(TiviColors.primary)
          Text($r('app.string.loading'))
            .fontSize(TiviTypo.bodySize)
            .fontColor(TiviColors.mutedForeground)
            .margin({ top: TiviSpacing.sm })
        }
        .width('100%')
        .margin({ top: 64 })
        .alignItems(HorizontalAlign.Center)
      }

      // Channel grid
      if (this.vm.channels.length > 0) {
        Grid() {
          ForEach(this.vm.channels, (item: ChannelGridItem) => {
            GridItem() {
              ChannelCard({
                channelName: item.channel.name,
                logoUrl: item.channel.logoUrl || '',
                currentProgram: item.nowTitle || '',
                isFavorite: item.channel.isFavorite,
                onCardClick: () => {
                  this.onChannelClick(item.channel.id);
                },
                onCardLongPress: () => {
                  this.vm.toggleFavorite(item.channel.id, !item.channel.isFavorite);
                }
              })
            }
          }, (item: ChannelGridItem) => item.channel.id.toString())
        }
        .columnsTemplate('1fr 1fr 1fr 1fr')
        .columnsGap(TiviSpacing.gridGap)
        .rowsGap(TiviSpacing.gridGap)
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
