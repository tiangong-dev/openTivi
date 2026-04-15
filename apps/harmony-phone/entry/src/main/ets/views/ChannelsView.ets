import { ChannelsViewModel } from '../viewmodels/ChannelsViewModel';
import { PlayerViewModel } from '../viewmodels/PlayerViewModel';
import { ChannelInfo } from '../models/Types';
import { ChannelLogo } from '../components/ChannelLogo';
import { GroupFilterChips } from '../components/GroupFilterChips';
import { SearchBar } from '../components/SearchBar';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { AppConstants } from '../common/Constants';

@Component
export struct ChannelsView {
  @Link playerVM: PlayerViewModel;
  @State vm: ChannelsViewModel = new ChannelsViewModel();
  @State searchText: string = '';
  @State isSearchExpanded: boolean = false;

  aboutToAppear(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    await this.vm.loadChannels();
    await this.vm.loadGroups();
  }

  build() {
    Column() {
      // Title bar
      Row() {
        Text($r('app.string.nav_channels'))
          .fontSize(TiviTypography.h1)
          .fontWeight(FontWeight.Bold)
          .layoutWeight(1)

        SymbolGlyph($r('sys.symbol.magnifyingglass'))
          .fontSize(22)
          .fontColor([TiviColors.lightForeground])
          .onClick(() => {
            this.isSearchExpanded = !this.isSearchExpanded;
          })
      }
      .width('100%')
      .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.md, bottom: TiviSpacing.sm })

      // Search bar (expandable)
      if (this.isSearchExpanded) {
        SearchBar({
          searchText: $searchText,
          placeholder: $r('app.string.channels_search_placeholder'),
          onChange: (text: string) => {
            this.vm.searchText = text;
          }
        })
        .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, bottom: TiviSpacing.sm })
        .transition(TransitionEffect.opacity(1).animation({ duration: AppConstants.ANIM_BASE }))
      }

      // Group filter chips
      if (this.vm.groups.length > 0) {
        GroupFilterChips({
          groups: this.vm.groups,
          selectedGroup: this.vm.selectedGroup ?? '',
          onGroupSelected: (group: string | undefined) => {
            this.vm.selectGroup(group);
          }
        })
      }

      // Channel list
      if (this.vm.isLoading && this.vm.channels.length === 0) {
        // Loading state
        Column() {
          LoadingProgress()
            .width(48)
            .height(48)
          Text($r('app.string.loading'))
            .fontSize(TiviTypography.small)
            .fontColor(TiviColors.lightMutedForeground)
            .margin({ top: TiviSpacing.md })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else if (this.vm.filteredChannels.length === 0 && !this.vm.isLoading) {
        // Empty state
        Column({ space: TiviSpacing.md }) {
          SymbolGlyph($r('sys.symbol.tv'))
            .fontSize(32)
            .fontColor([TiviColors.lightMutedForeground])

          Text($r('app.string.channels_no_channels'))
            .fontSize(TiviTypography.h3)
            .fontWeight(FontWeight.Medium)

          Text($r('app.string.channels_import_hint'))
            .fontSize(TiviTypography.small)
            .fontColor(TiviColors.lightMutedForeground)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
      } else {
        // Channel list with pull-to-refresh
        Refresh({ refreshing: $$this.vm.isLoading }) {
          List() {
            ForEach(this.vm.filteredChannels, (channel: ChannelInfo) => {
              ListItem() {
                this.ChannelRowItem(channel)
              }
              .swipeAction({
                end: this.SwipeDeleteBuilder(channel)
              })
            }, (channel: ChannelInfo) => channel.id.toString())
          }
          .width('100%')
          .layoutWeight(1)
          .divider({
            strokeWidth: 0.5,
            color: TiviColors.lightBorder,
            startMargin: TiviSpacing.lg + AppConstants.LOGO_SIZE_MEDIUM + TiviSpacing.md,
            endMargin: TiviSpacing.lg
          })
          .scrollBar(BarState.Auto)
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

  @Builder
  ChannelRowItem(channel: ChannelInfo) {
    Row({ space: TiviSpacing.md }) {
      ChannelLogo({
        url: channel.logoUrl ?? '',
        size: AppConstants.LOGO_SIZE_MEDIUM
      })

      Column({ space: 2 }) {
        Row({ space: 4 }) {
          Text(channel.name)
            .fontSize(TiviTypography.h4)
            .fontWeight(FontWeight.Medium)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .layoutWeight(1)

          if (channel.isFavorite) {
            SymbolGlyph($r('sys.symbol.star_fill'))
              .fontSize(12)
              .fontColor([TiviColors.lightFavorite])
          }
        }
        .width('100%')

        if (channel.groupName && channel.groupName.length > 0) {
          Text(channel.groupName)
            .fontSize(TiviTypography.caption)
            .fontColor(TiviColors.lightMutedForeground)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      if (channel.channelNumber && channel.channelNumber.length > 0) {
        Text(channel.channelNumber)
          .fontSize(TiviTypography.caption)
          .fontColor(TiviColors.lightMutedForeground)
      }

      SymbolGlyph($r('sys.symbol.play_circle'))
        .fontSize(24)
        .fontColor([TiviColors.lightPrimary])
    }
    .width('100%')
    .padding({ top: 8, bottom: 8, left: TiviSpacing.lg, right: TiviSpacing.lg })
    .onClick(async () => {
      await this.playerVM.play(channel, this.vm.filteredChannels);
    })
  }

  @Builder
  SwipeDeleteBuilder(channel: ChannelInfo) {
    Row() {
      Button() {
        SymbolGlyph($r('sys.symbol.star_fill'))
          .fontSize(20)
          .fontColor([TiviColors.overlayText])
      }
      .width(80)
      .height('100%')
      .backgroundColor(TiviColors.lightFavorite)
      .onClick(async () => {
        await this.vm.toggleFavorite(channel.id);
      })
    }
  }
}
