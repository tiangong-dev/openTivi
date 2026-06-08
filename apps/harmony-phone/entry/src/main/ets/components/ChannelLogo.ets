import { TiviColors, TiviRadius } from '../common/Theme';

@Component
export struct ChannelLogo {
  @Prop url: string = '';
  @Prop size: number = 48;
  @State imageLoaded: boolean = false;
  @State imageFailed: boolean = false;

  build() {
    if (this.url && this.url.length > 0 && !this.imageFailed) {
      Image(this.url)
        .width(this.size)
        .height(this.size)
        .borderRadius(TiviRadius.md)
        .objectFit(ImageFit.Contain)
        .backgroundColor(TiviColors.lightMuted)
        .onComplete(() => {
          this.imageLoaded = true;
        })
        .onError(() => {
          this.imageFailed = true;
        })
    } else {
      // Placeholder
      Column() {
        SymbolGlyph($r('sys.symbol.tv'))
          .fontSize(this.size * 0.35)
          .fontColor([TiviColors.lightMutedForeground])
      }
      .width(this.size)
      .height(this.size)
      .borderRadius(TiviRadius.md)
      .backgroundColor(TiviColors.lightMuted)
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
  }
}
