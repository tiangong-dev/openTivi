import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { ChannelsView } from '../views/ChannelsView';
import { FavoritesView } from '../views/FavoritesView';
import { RecentsView } from '../views/RecentsView';
import { SourcesView } from '../views/SourcesView';
import { SettingsView } from '../views/SettingsView';
import { MiniPlayerBar } from '../components/MiniPlayerBar';
import { TiviColors, TiviTypography, TiviSpacing } from '../common/Theme';
import { AppConstants } from '../common/Constants';
import { router } from '@kit.ArkUI';

@Entry
@Component
struct Index {
  @State currentTab: number = 0;
  @State @Watch('onPlayerChanged') playerVM: PlayerViewModel = new PlayerViewModel();

  onPlayerChanged(): void {
    if (this.playerVM.isFullScreen) {
      router.pushUrl({ url: 'pages/PlayerPage' });
    }
  }

  @Builder
  TabIcon(icon: Resource, label: Resource, index: number) {
    Column({ space: 2 }) {
      SymbolGlyph(icon)
        .fontSize(22)
        .fontColor([this.currentTab === index ? TiviColors.lightPrimary : TiviColors.lightMutedForeground])
      Text(label)
        .fontSize(TiviTypography.badge)
        .fontColor(this.currentTab === index ? TiviColors.lightPrimary : TiviColors.lightMutedForeground)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      Tabs({ barPosition: BarPosition.End, index: this.currentTab }) {
        TabContent() {
          ChannelsView({ playerVM: $playerVM })
        }
        .tabBar(this.TabIcon($r('sys.symbol.tv'), $r('app.string.nav_channels'), 0))
        .padding({ bottom: this.playerVM.isPlaying && !this.playerVM.isFullScreen ? AppConstants.MINI_PLAYER_HEIGHT : 0 })

        TabContent() {
          FavoritesView({ playerVM: $playerVM })
        }
        .tabBar(this.TabIcon($r('sys.symbol.star'), $r('app.string.nav_favorites'), 1))
        .padding({ bottom: this.playerVM.isPlaying && !this.playerVM.isFullScreen ? AppConstants.MINI_PLAYER_HEIGHT : 0 })

        TabContent() {
          RecentsView({ playerVM: $playerVM })
        }
        .tabBar(this.TabIcon($r('sys.symbol.clock'), $r('app.string.nav_recents'), 2))
        .padding({ bottom: this.playerVM.isPlaying && !this.playerVM.isFullScreen ? AppConstants.MINI_PLAYER_HEIGHT : 0 })

        TabContent() {
          SourcesView()
        }
        .tabBar(this.TabIcon($r('sys.symbol.antenna_radiowaves_left_and_right'), $r('app.string.nav_sources'), 3))

        TabContent() {
          SettingsView()
        }
        .tabBar(this.TabIcon($r('sys.symbol.gearshape'), $r('app.string.nav_settings'), 4))
      }
      .barHeight(AppConstants.TAB_BAR_HEIGHT)
      .onChange((index: number) => {
        this.currentTab = index;
      })
      .width('100%')
      .height('100%')
      .scrollable(false)

      // Mini player bar (above tab bar)
      if (this.playerVM.isPlaying && !this.playerVM.isFullScreen) {
        MiniPlayerBar({ playerVM: $playerVM })
          .margin({ bottom: AppConstants.TAB_BAR_HEIGHT })
      }
    }
    .width('100%')
    .height('100%')
  }
}
