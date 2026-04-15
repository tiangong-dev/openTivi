import { FavoritesViewModel } from '../viewmodels/FavoritesViewModel';
import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { ChannelInfo } from '../models/Types';
import { ChannelLogo } from '../components/ChannelLogo';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { AppConstants } from '../common/Constants';

@Component
export struct FavoritesView {
  @Link playerVM: PlayerViewModel;
  @State vm: FavoritesViewModel = new FavoritesViewModel();

  aboutToAppear(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    await this.vm.load();
  }

  build() {
    Column() {
      // Title
      Text($r('app.string.favorites_title'))
        .fontSize(TiviTypography.h1)
        .fontWeight(FontWeight.Bold)
        .width('100%')
        .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.md, bottom: TiviSpacing.md })

      if (this.vm.isLoading && this.vm.favorites.length === 0) {
        // Loading
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else if (this.vm.favorites.length === 0 && !this.vm.isLoading) {
        // Empty state
        Column({ space: TiviSpacing.md }) {
          SymbolGlyph($r('sys.symbol.star'))
            .fontSize(32)
            .fontColor([TiviColors.lightMutedForeground])

          Text($r('app.string.favorites_no_favorites'))
            .fontSize(TiviTypography.h3)
            .fontWeight(FontWeight.Medium)

          Text($r('app.string.favorites_add_hint'))
            .fontSize(TiviTypography.small)
            .fontColor(TiviColors.lightMutedForeground)
            .textAlign(TextAlign.Center)
            .padding({ left: TiviSpacing.xxxl, right: TiviSpacing.xxxl })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else {
        // Grid of favorites
        Refresh({ refreshing: $$this.vm.isLoading }) {
          WaterFlow() {
            ForEach(this.vm.favorites, (channel: ChannelInfo) => {
              FlowItem() {
                Column({ space: TiviSpacing.sm - 2 }) {
                  ChannelLogo({
                    url: channel.logoUrl ?? '',
                    size: AppConstants.LOGO_SIZE_LARGE
                  })

                  Text(channel.name)
                    .fontSize(TiviTypography.caption)
                    .maxLines(2)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                    .textAlign(TextAlign.Center)
                }
                .width('100%')
                .padding(TiviSpacing.sm)
                .alignItems(HorizontalAlign.Center)
                .onClick(async () => {
                  await this.playerVM.play(channel, this.vm.favorites);
                })
                .gesture(
                  LongPressGesture()
                    .onAction(async () => {
                      await this.vm.removeFavorite(channel.id);
                    })
                )
              }
            }, (channel: ChannelInfo) => channel.id.toString())
          }
          .columnsTemplate('1fr 1fr 1fr')
          .columnsGap(TiviSpacing.sm)
          .rowsGap(TiviSpacing.sm)
          .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg })
          .width('100%')
          .layoutWeight(1)
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
