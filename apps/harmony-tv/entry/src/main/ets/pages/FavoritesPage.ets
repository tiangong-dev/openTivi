import { TiviColors, TiviTypo, TiviSpacing } from '../common/Theme';
import { ChannelCard } from '../components/ChannelCard';
import { FavoritesViewModel } from '../viewmodels/FavoritesViewModel';
import { FavoriteGridItem } from '../models/Types';

/**
 * Favorites page showing channels marked as favorite in a grid layout.
 */
@Component
export struct FavoritesPage {
  onChannelClick: (channelId: number) => void = () => {};
  @State private vm: FavoritesViewModel = new FavoritesViewModel();

  aboutToAppear(): void {
    this.vm.loadFavorites();
  }

  build() {
    Column() {
      // Page title
      Text($r('app.string.favorites_title'))
        .fontSize(TiviTypo.h1Size)
        .fontWeight(TiviTypo.weightBold)
        .fontColor(TiviColors.foreground)

      // Loading
      if (this.vm.loading && this.vm.favorites.length === 0) {
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

      // Empty state
      if (this.vm.favorites.length === 0 && !this.vm.loading) {
        Column() {
          SymbolGlyph($r('sys.symbol.star'))
            .fontSize(TiviTypo.iconHugeSize)
            .fontColor([TiviColors.mutedForeground])
          Text($r('app.string.favorites_empty'))
            .fontSize(TiviTypo.bodyLargeSize)
            .fontColor(TiviColors.mutedForeground)
            .margin({ top: TiviSpacing.base })
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .margin({ top: 64 })
        .alignItems(HorizontalAlign.Center)
      }

      // Favorites grid
      if (this.vm.favorites.length > 0) {
        Grid() {
          ForEach(this.vm.favorites, (item: FavoriteGridItem) => {
            GridItem() {
              ChannelCard({
                channelName: item.channel.name,
                logoUrl: item.channel.logoUrl || '',
                currentProgram: item.nowTitle || '',
                isFavorite: true,
                onCardClick: () => {
                  this.onChannelClick(item.channel.id);
                },
                onCardLongPress: () => {
                  this.vm.removeFavorite(item.channel.id);
                }
              })
            }
          }, (item: FavoriteGridItem) => item.channel.id.toString())
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
