import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus } from '../common/Theme';
import { RecentsViewModel } from '../viewmodels/RecentsViewModel';
import { FavoritesViewModel } from '../viewmodels/FavoritesViewModel';
import { RecentChannelInfo, FavoriteGridItem } from '../models/Types';

/**
 * Home page with hero section (last watched channel), continue watching row,
 * and favorites row. Mirrors the Android TV HomeScreen.
 */
@Component
export struct HomePage {
  onChannelClick: (channelId: number) => void = () => {};
  @State private recentsVM: RecentsViewModel = new RecentsViewModel();
  @State private favoritesVM: FavoritesViewModel = new FavoritesViewModel();

  aboutToAppear(): void {
    this.recentsVM.loadRecents();
    this.favoritesVM.loadFavorites();
  }

  build() {
    Column() {
      // Hero section — last watched channel or welcome message
      if (this.recentsVM.recents.length > 0) {
        this.HeroSection(this.recentsVM.recents[0])
      } else {
        this.WelcomeSection()
      }

      // Continue Watching row
      if (this.recentsVM.recents.length > 0) {
        this.HorizontalRowSection(
          $r('app.string.home_continue_watching'),
          this.recentsVM.recents.map((r: RecentChannelInfo) => ({
            id: r.id,
            title: r.name,
            subtitle: r.lastWatchedAt,
            logoUrl: r.logoUrl
          }))
        )
      }

      // Favorites row
      if (this.favoritesVM.favorites.length > 0) {
        this.HorizontalRowSection(
          $r('app.string.home_favorites'),
          this.favoritesVM.favorites.map((f: FavoriteGridItem) => ({
            id: f.channel.id,
            title: f.channel.name,
            subtitle: f.nowTitle || '',
            logoUrl: f.channel.logoUrl
          }))
        )
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

  @Builder
  HeroSection(hero: RecentChannelInfo) {
    Row() {
      // Text content
      Column() {
        Text($r('app.string.home_continue_watching'))
          .fontSize(TiviTypo.captionSize)
          .fontWeight(TiviTypo.weightMedium)
          .fontColor(TiviColors.mutedForeground)

        Text(hero.name)
          .fontSize(TiviTypo.displaySize)
          .fontWeight(TiviTypo.weightBold)
          .fontColor(TiviColors.foreground)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ top: TiviSpacing.sm })

        Row({ space: TiviSpacing.xs }) {
          SymbolGlyph($r('sys.symbol.play_fill'))
            .fontSize(TiviTypo.iconMediumSize)
            .fontColor([TiviColors.primary])
          Text($r('app.string.home_resume'))
            .fontSize(TiviTypo.bodyLargeSize)
            .fontColor(TiviColors.primary)
        }
        .margin({ top: TiviSpacing.md })
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)

      // Channel logo (faded, right side)
      if (hero.logoUrl) {
        Image(hero.logoUrl)
          .width(160)
          .height(160)
          .objectFit(ImageFit.Contain)
          .opacity(0.3)
      }
    }
    .width('100%')
    .height(260)
    .padding(TiviSpacing.xl)
    .backgroundColor(TiviColors.card)
    .borderRadius(TiviRadius.xl)
    .focusable(true)
    .onClick(() => {
      this.onChannelClick(hero.id);
    })
    .stateStyles({
      focused: {
        .border({ width: TiviFocus.borderWidth, color: TiviColors.focusBorder, style: BorderStyle.Solid })
        .scale({ x: 1.02, y: 1.02 })
      },
      normal: {
        .border({ width: 1, color: TiviColors.border })
        .scale({ x: 1.0, y: 1.0 })
      }
    })
    .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
    .linearGradient({
      direction: GradientDirection.Right,
      colors: [[TiviColors.primarySoft, 0.0], [TiviColors.card, 1.0]]
    })
    .margin({ bottom: TiviSpacing.sectionGap })
  }

  @Builder
  WelcomeSection() {
    Text($r('app.string.home_welcome'))
      .fontSize(TiviTypo.displaySize)
      .fontWeight(TiviTypo.weightBold)
      .fontColor(TiviColors.foreground)
      .margin({ bottom: TiviSpacing.sectionGap })
  }

  @Builder
  HorizontalRowSection(title: ResourceStr, items: RowItemData[]) {
    Column() {
      Text(title)
        .fontSize(TiviTypo.h2Size)
        .fontWeight(TiviTypo.weightSemibold)
        .fontColor(TiviColors.foreground)
        .margin({ bottom: TiviSpacing.base })

      Scroll() {
        Row({ space: TiviSpacing.gridGap }) {
          ForEach(items, (item: RowItemData) => {
            Column() {
              if (item.logoUrl) {
                Image(item.logoUrl)
                  .width(40)
                  .height(40)
                  .objectFit(ImageFit.Contain)
                  .margin({ bottom: TiviSpacing.sm })
              }

              Text(item.title)
                .fontSize(TiviTypo.h4Size)
                .fontWeight(TiviTypo.weightMedium)
                .fontColor(TiviColors.cardForeground)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })

              if (item.subtitle) {
                Text(item.subtitle)
                  .fontSize(TiviTypo.smallSize)
                  .fontColor(TiviColors.mutedForeground)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
                  .margin({ top: TiviSpacing.xs })
              }
            }
            .width(200)
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
                .scale({ x: TiviFocus.scale, y: TiviFocus.scale })
              },
              normal: {
                .border({ width: 1, color: TiviColors.border })
                .scale({ x: 1.0, y: 1.0 })
              }
            })
            .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
          }, (item: RowItemData) => item.id.toString())
        }
      }
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .margin({ bottom: TiviSpacing.sectionGap })
    .alignItems(HorizontalAlign.Start)
  }
}

interface RowItemData {
  id: number;
  title: string;
  subtitle: string;
  logoUrl?: string;
}
