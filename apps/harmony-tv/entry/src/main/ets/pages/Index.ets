import { SideNavBar } from '../components/SideNavBar';
import { NavTab } from '../models/Types';
import { TiviColors, TiviSpacing } from '../common/Theme';
import { ChannelsPage } from './ChannelsPage';
import { FavoritesPage } from './FavoritesPage';
import { RecentsPage } from './RecentsPage';
import { SourcesPage } from './SourcesPage';
import { SettingsPage } from './SettingsPage';
import { HomePage } from './HomePage';
import router from '@ohos.router';

/**
 * Main page with sidebar navigation and content area.
 * This is the root page loaded by EntryAbility. It hosts a NavigationDrawer-
 * style layout: a collapsible sidebar on the left and the active content page
 * on the right. D-pad left returns focus to the sidebar; pressing Enter/OK
 * on a sidebar item switches the content page.
 */
@Entry
@Component
struct Index {
  @State selectedTab: NavTab = NavTab.Home;
  @State isSidebarExpanded: boolean = false;

  build() {
    Row() {
      // Sidebar navigation
      SideNavBar({
        selectedTab: this.selectedTab,
        isExpanded: this.isSidebarExpanded,
        onTabSelected: (tab: NavTab) => {
          this.selectedTab = tab;
          // Collapse sidebar after selection to give content area more space
          this.isSidebarExpanded = false;
        },
        onExpandedChange: (expanded: boolean) => {
          this.isSidebarExpanded = expanded;
        }
      })

      // Content area
      Column() {
        if (this.selectedTab === NavTab.Home) {
          HomePage({
            onChannelClick: (channelId: number) => {
              this.navigateToPlayer(channelId);
            }
          })
        } else if (this.selectedTab === NavTab.Channels) {
          ChannelsPage({
            onChannelClick: (channelId: number) => {
              this.navigateToPlayer(channelId);
            }
          })
        } else if (this.selectedTab === NavTab.Favorites) {
          FavoritesPage({
            onChannelClick: (channelId: number) => {
              this.navigateToPlayer(channelId);
            }
          })
        } else if (this.selectedTab === NavTab.Recents) {
          RecentsPage({
            onChannelClick: (channelId: number) => {
              this.navigateToPlayer(channelId);
            }
          })
        } else if (this.selectedTab === NavTab.Sources) {
          SourcesPage()
        } else if (this.selectedTab === NavTab.Settings) {
          SettingsPage()
        }
      }
      .layoutWeight(1)
      .height('100%')
      .backgroundColor(TiviColors.background)
      .onFocus(() => {
        // Collapse sidebar when content receives focus
        this.isSidebarExpanded = false;
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(TiviColors.background)
    .onKeyEvent((event: KeyEvent) => {
      if (event.type === KeyType.Down) {
        // D-pad Left at content edge expands sidebar
        if (event.keyCode === 21) { // KEYCODE_DPAD_LEFT
          if (!this.isSidebarExpanded) {
            this.isSidebarExpanded = true;
          }
        }
      }
    })
  }

  private navigateToPlayer(channelId: number): void {
    router.pushUrl({
      url: 'pages/PlayerPage',
      params: { channelId: channelId }
    });
  }
}
