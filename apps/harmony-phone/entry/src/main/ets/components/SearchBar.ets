import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';

@Component
export struct SearchBar {
  @Link searchText: string;
  placeholder: string | Resource = '';
  onChange: (text: string) => void = () => {};

  build() {
    Row({ space: TiviSpacing.sm }) {
      SymbolGlyph($r('sys.symbol.magnifyingglass'))
        .fontSize(18)
        .fontColor([TiviColors.lightMutedForeground])

      TextInput({ text: this.searchText, placeholder: this.placeholder })
        .layoutWeight(1)
        .fontSize(TiviTypography.body)
        .backgroundColor(Color.Transparent)
        .borderRadius(0)
        .padding(0)
        .onChange((value: string) => {
          this.searchText = value;
          this.onChange(value);
        })

      if (this.searchText.length > 0) {
        SymbolGlyph($r('sys.symbol.xmark_circle_fill'))
          .fontSize(18)
          .fontColor([TiviColors.lightMutedForeground])
          .onClick(() => {
            this.searchText = '';
            this.onChange('');
          })
      }
    }
    .width('100%')
    .height(40)
    .padding({ left: TiviSpacing.md, right: TiviSpacing.md })
    .backgroundColor(TiviColors.lightSecondary)
    .borderRadius(TiviRadius.lg)
  }
}
