import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';

@Component
export struct GroupFilterChips {
  @Prop groups: string[] = [];
  @Prop selectedGroup: string = '';
  onGroupSelected: (group: string | undefined) => void = () => {};

  build() {
    Scroll() {
      Row({ space: TiviSpacing.sm }) {
        // "All" chip
        this.ChipButton({
          label: $r('app.string.channels_all'),
          isSelected: this.selectedGroup === '',
          onTap: () => this.onGroupSelected(undefined)
        })

        ForEach(this.groups, (group: string) => {
          this.ChipButton({
            label: group,
            isSelected: this.selectedGroup === group,
            onTap: () => this.onGroupSelected(group)
          })
        }, (group: string) => group)
      }
      .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.sm, bottom: TiviSpacing.sm })
    }
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
    .width('100%')
  }

  @Builder
  ChipButton($$: { label: string | Resource, isSelected: boolean, onTap: () => void }) {
    Text($$.label)
      .fontSize(TiviTypography.small)
      .fontWeight($$.isSelected ? FontWeight.Medium : FontWeight.Normal)
      .padding({ left: TiviSpacing.md, right: TiviSpacing.md, top: TiviSpacing.sm - 2, bottom: TiviSpacing.sm - 2 })
      .backgroundColor($$.isSelected ? TiviColors.lightPrimary : TiviColors.lightSecondary)
      .fontColor($$.isSelected ? TiviColors.lightPrimaryForeground : TiviColors.lightForeground)
      .borderRadius(TiviRadius.full)
      .onClick(() => $$.onTap())
  }
}
