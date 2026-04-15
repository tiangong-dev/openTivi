import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus } from '../common/Theme';

/**
 * Focusable channel card for the TV grid. Shows channel logo, name,
 * current EPG program, and favorite indicator. Scales up on focus
 * with a highlighted border for 10-foot visibility.
 */
@Component
export struct ChannelCard {
  @Prop channelName: string = '';
  @Prop logoUrl: string = '';
  @Prop currentProgram: string = '';
  @Prop isFavorite: boolean = false;
  onCardClick: () => void = () => {};
  onCardLongPress: () => void = () => {};

  build() {
    Column() {
      // Top row: logo + favorite star
      Row() {
        if (this.logoUrl) {
          Image(this.logoUrl)
            .width(48)
            .height(48)
            .objectFit(ImageFit.Contain)
            .alt($r('sys.symbol.tv'))
            .onError(() => {
              // Logo load failed — SymbolGlyph alt handles this
            })
        } else {
          SymbolGlyph($r('sys.symbol.tv'))
            .fontSize(TiviTypo.iconLargeSize)
            .fontColor([TiviColors.mutedForeground])
        }

        Blank()

        if (this.isFavorite) {
          SymbolGlyph($r('sys.symbol.star_fill'))
            .fontSize(TiviTypo.h4Size)
            .fontColor([TiviColors.favorite])
        }
      }
      .width('100%')
      .justifyContent(FlexAlign.SpaceBetween)
      .alignItems(VerticalAlign.Center)

      // Channel name
      Text(this.channelName)
        .fontSize(TiviTypo.h4Size)
        .fontWeight(TiviTypo.weightSemibold)
        .fontColor(TiviColors.cardForeground)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .margin({ top: TiviSpacing.md })

      // Current program (EPG)
      if (this.currentProgram) {
        Text(this.currentProgram)
          .fontSize(TiviTypo.smallSize)
          .fontColor(TiviColors.mutedForeground)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .margin({ top: TiviSpacing.xs })
      }
    }
    .width('100%')
    .padding(TiviSpacing.base)
    .backgroundColor(TiviColors.card)
    .borderRadius(TiviRadius.lg)
    .focusable(true)
    .onClick(() => {
      this.onCardClick();
    })
    .gesture(
      LongPressGesture({ repeat: false })
        .onAction(() => {
          this.onCardLongPress();
        })
    )
    .stateStyles({
      focused: {
        .border({ width: TiviFocus.borderWidth, color: TiviColors.focusBorder, style: BorderStyle.Solid })
        .scale({ x: TiviFocus.scale, y: TiviFocus.scale })
        .shadow({ radius: 16, color: TiviColors.overlayLight, offsetX: 0, offsetY: 4 })
      },
      normal: {
        .border({ width: 1, color: TiviColors.border })
        .scale({ x: 1.0, y: 1.0 })
        .shadow({ radius: 0, color: TiviColors.transparent, offsetX: 0, offsetY: 0 })
      }
    })
    .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
  }
}
