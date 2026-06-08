import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus } from '../common/Theme';

/**
 * Horizontal row of focusable group filter chips for channel filtering.
 * "All" chip is always first, followed by group names from the source.
 */
@Component
export struct GroupChips {
  @Prop groups: string[] = [];
  @Prop selectedGroup: string = '';
  onGroupSelected: (group: string | undefined) => void = () => {};

  build() {
    Scroll() {
      Row({ space: TiviSpacing.sm }) {
        // "All" chip
        this.ChipBuilder($r('app.string.channels_all'), !this.selectedGroup, () => {
          this.onGroupSelected(undefined);
        })

        // Group chips
        ForEach(this.groups, (group: string) => {
          this.ChipBuilder(group, this.selectedGroup === group, () => {
            this.onGroupSelected(group);
          })
        }, (group: string) => group)
      }
      .padding({ left: TiviSpacing.xs, right: TiviSpacing.xs })
    }
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
    .width('100%')
  }

  @Builder
  ChipBuilder(label: ResourceStr | string, isSelected: boolean, onClick: () => void) {
    Text(label)
      .fontSize(TiviTypo.smallSize)
      .fontWeight(isSelected ? TiviTypo.weightSemibold : TiviTypo.weightRegular)
      .fontColor(isSelected ? TiviColors.primaryForeground : TiviColors.foreground)
      .backgroundColor(isSelected ? TiviColors.primary : TiviColors.secondary)
      .borderRadius(TiviRadius.xxl)
      .padding({
        left: TiviSpacing.base,
        right: TiviSpacing.base,
        top: TiviSpacing.sm,
        bottom: TiviSpacing.sm
      })
      .focusable(true)
      .onClick(onClick)
      .stateStyles({
        focused: {
          .border({ width: 2, color: TiviColors.focusBorder, style: BorderStyle.Solid })
          .scale({ x: 1.08, y: 1.08 })
        },
        normal: {
          .border({ width: 0, color: TiviColors.transparent })
          .scale({ x: 1.0, y: 1.0 })
        }
      })
      .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
  }
}
