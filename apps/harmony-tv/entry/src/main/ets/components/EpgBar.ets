import { TiviColors, TiviRadius } from '../common/Theme';

/**
 * EPG progress bar showing how far into the current program we are.
 * A thin horizontal bar: track in border color, fill in primary.
 */
@Component
export struct EpgBar {
  @Prop progress: number = 0; // 0.0 to 1.0

  build() {
    Stack({ alignContent: Alignment.Start }) {
      // Track
      Row()
        .width('100%')
        .height(4)
        .borderRadius(2)
        .backgroundColor(TiviColors.border)

      // Fill
      Row()
        .width(`${Math.min(100, Math.max(0, this.progress * 100))}%`)
        .height(4)
        .borderRadius(2)
        .backgroundColor(TiviColors.primary)
    }
    .width('100%')
    .height(4)
  }
}
