import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus, TiviSidebar } from '../common/Theme';
import { NavTab } from '../models/Types';

/**
 * TV sidebar navigation drawer with icons and labels.
 * Supports D-pad focus navigation. Collapses when content area is focused,
 * expands when the sidebar receives focus.
 */

interface NavItemData {
  tab: NavTab;
  icon: Resource;
  label: ResourceStr;
}

@Component
export struct SideNavBar {
  @Prop selectedTab: NavTab = NavTab.Home;
  @Prop isExpanded: boolean = true;
  onTabSelected: (tab: NavTab) => void = () => {};
  onExpandedChange: (expanded: boolean) => void = () => {};

  private navItems: NavItemData[] = [
    { tab: NavTab.Home, icon: $r('sys.symbol.house'), label: $r('app.string.nav_home') },
    { tab: NavTab.Channels, icon: $r('sys.symbol.tv'), label: $r('app.string.nav_channels') },
    { tab: NavTab.Favorites, icon: $r('sys.symbol.star'), label: $r('app.string.nav_favorites') },
    { tab: NavTab.Recents, icon: $r('sys.symbol.clock'), label: $r('app.string.nav_recents') },
    { tab: NavTab.Sources, icon: $r('sys.symbol.folder'), label: $r('app.string.nav_sources') },
    { tab: NavTab.Settings, icon: $r('sys.symbol.gearshape'), label: $r('app.string.nav_settings') },
  ];

  build() {
    Column() {
      // App title
      Text($r('app.string.app_name'))
        .fontSize(this.isExpanded ? TiviTypo.h2Size : 0)
        .fontWeight(TiviTypo.weightBold)
        .fontColor(TiviColors.primary)
        .padding({
          left: TiviSpacing.base,
          right: TiviSpacing.base,
          top: TiviSpacing.lg,
          bottom: TiviSpacing.lg
        })
        .visibility(this.isExpanded ? Visibility.Visible : Visibility.Hidden)
        .height(this.isExpanded ? undefined : 0)

      // Navigation items
      ForEach(this.navItems, (item: NavItemData) => {
        this.NavItemBuilder(item)
      }, (item: NavItemData) => item.tab.toString())
    }
    .width(this.isExpanded ? TiviSidebar.expandedWidth : TiviSidebar.collapsedWidth)
    .height('100%')
    .backgroundColor(TiviColors.card)
    .padding({ top: TiviSpacing.safeAreaY, bottom: TiviSpacing.safeAreaY })
    .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
    .borderWidth({ right: 1 })
    .borderColor(TiviColors.border)
  }

  @Builder
  NavItemBuilder(item: NavItemData) {
    Row() {
      SymbolGlyph(item.icon)
        .fontSize(TiviTypo.iconNavSize)
        .fontColor([this.selectedTab === item.tab ? TiviColors.primary : TiviColors.mutedForeground])
        .margin({ left: TiviSpacing.base, right: this.isExpanded ? TiviSpacing.md : 0 })

      if (this.isExpanded) {
        Text(item.label)
          .fontSize(TiviTypo.bodyLargeSize)
          .fontWeight(this.selectedTab === item.tab ? TiviTypo.weightSemibold : TiviTypo.weightRegular)
          .fontColor(this.selectedTab === item.tab ? TiviColors.foreground : TiviColors.mutedForeground)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
    }
    .width('100%')
    .height(52)
    .alignItems(VerticalAlign.Center)
    .borderRadius(TiviRadius.lg)
    .backgroundColor(this.selectedTab === item.tab ? TiviColors.sidebarSelected : TiviColors.transparent)
    .margin({ left: TiviSpacing.sm, right: TiviSpacing.sm, bottom: TiviSpacing.xs })
    .padding({ right: TiviSpacing.base })
    .focusable(true)
    .onClick(() => {
      this.onTabSelected(item.tab);
    })
    .onFocus(() => {
      if (!this.isExpanded) {
        this.onExpandedChange(true);
      }
    })
    .stateStyles({
      focused: {
        .border({ width: TiviFocus.borderWidth, color: TiviColors.focusBorder, style: BorderStyle.Solid })
        .scale({ x: 1.02, y: 1.02 })
      },
      normal: {
        .border({ width: 0, color: TiviColors.transparent })
        .scale({ x: 1.0, y: 1.0 })
      }
    })
  }
}
