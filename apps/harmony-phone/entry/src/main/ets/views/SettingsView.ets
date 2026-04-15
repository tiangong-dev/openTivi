import { SettingsViewModel } from '../viewmodels/SettingsViewModel';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { AppConstants } from '../common/Constants';

@Component
export struct SettingsView {
  @State vm: SettingsViewModel = new SettingsViewModel();
  @State showLanguagePicker: boolean = false;

  aboutToAppear(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    await this.vm.load();
  }

  build() {
    Column() {
      // Title
      Text($r('app.string.settings_title'))
        .fontSize(TiviTypography.h1)
        .fontWeight(FontWeight.Bold)
        .width('100%')
        .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.md, bottom: TiviSpacing.md })

      List() {
        // General section
        ListItemGroup({ header: this.SectionHeader($r('app.string.settings_general')) }) {
          // Language
          ListItem() {
            Row() {
              Text($r('app.string.settings_language'))
                .fontSize(TiviTypography.body)
                .layoutWeight(1)

              Text(this.vm.currentLocale === 'zh-CN' ? '中文' : 'English')
                .fontSize(TiviTypography.body)
                .fontColor(TiviColors.lightMutedForeground)

              SymbolGlyph($r('sys.symbol.chevron_right'))
                .fontSize(14)
                .fontColor([TiviColors.lightMutedForeground])
                .margin({ left: TiviSpacing.xs })
            }
            .width('100%')
            .padding({ top: TiviSpacing.md, bottom: TiviSpacing.md, left: TiviSpacing.lg, right: TiviSpacing.lg })
            .onClick(() => {
              this.showLanguagePicker = true;
            })
          }
        }

        // About section
        ListItemGroup({ header: this.SectionHeader($r('app.string.settings_about')) }) {
          ListItem() {
            Row() {
              Text($r('app.string.settings_version'))
                .fontSize(TiviTypography.body)
                .layoutWeight(1)

              Text(AppConstants.APP_VERSION)
                .fontSize(TiviTypography.body)
                .fontColor(TiviColors.lightMutedForeground)
            }
            .width('100%')
            .padding({ top: TiviSpacing.md, bottom: TiviSpacing.md, left: TiviSpacing.lg, right: TiviSpacing.lg })
          }

          ListItem() {
            Row() {
              Text($r('app.string.settings_build'))
                .fontSize(TiviTypography.body)
                .layoutWeight(1)

              Text(AppConstants.APP_BUILD)
                .fontSize(TiviTypography.body)
                .fontColor(TiviColors.lightMutedForeground)
            }
            .width('100%')
            .padding({ top: TiviSpacing.md, bottom: TiviSpacing.md, left: TiviSpacing.lg, right: TiviSpacing.lg })
          }

          ListItem() {
            Row() {
              Text('GitHub')
                .fontSize(TiviTypography.body)
                .fontColor(TiviColors.lightPrimary)
                .layoutWeight(1)

              SymbolGlyph($r('sys.symbol.chevron_right'))
                .fontSize(14)
                .fontColor([TiviColors.lightMutedForeground])
            }
            .width('100%')
            .padding({ top: TiviSpacing.md, bottom: TiviSpacing.md, left: TiviSpacing.lg, right: TiviSpacing.lg })
          }
        }
      }
      .width('100%')
      .layoutWeight(1)
      .divider({
        strokeWidth: 0.5,
        color: TiviColors.lightBorder,
        startMargin: TiviSpacing.lg,
        endMargin: TiviSpacing.lg
      })
      .listDirection(Axis.Vertical)

      // Language picker sheet
      if (this.showLanguagePicker) {
        this.LanguagePickerSheet()
      }
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  SectionHeader(title: Resource) {
    Text(title)
      .fontSize(TiviTypography.small)
      .fontWeight(FontWeight.Medium)
      .fontColor(TiviColors.lightMutedForeground)
      .width('100%')
      .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.xl, bottom: TiviSpacing.sm })
      .textTransform(TextTransform.Uppercase)
  }

  @Builder
  LanguagePickerSheet() {
    Column() {
      Column()
        .width('100%')
        .layoutWeight(1)
        .backgroundColor(TiviColors.overlayShadow)
        .onClick(() => {
          this.showLanguagePicker = false;
        })

      Column({ space: TiviSpacing.sm }) {
        // Handle
        Row()
          .width(36)
          .height(4)
          .borderRadius(2)
          .backgroundColor(TiviColors.lightMuted)
          .margin({ top: TiviSpacing.sm, bottom: TiviSpacing.md })

        Text($r('app.string.settings_language'))
          .fontSize(TiviTypography.h3)
          .fontWeight(FontWeight.Bold)
          .margin({ bottom: TiviSpacing.md })

        // English option
        Row() {
          Text('English')
            .fontSize(TiviTypography.body)
            .layoutWeight(1)

          if (this.vm.currentLocale === 'en-US') {
            SymbolGlyph($r('sys.symbol.checkmark'))
              .fontSize(18)
              .fontColor([TiviColors.lightPrimary])
          }
        }
        .width('100%')
        .padding(TiviSpacing.lg)
        .borderRadius(TiviRadius.md)
        .backgroundColor(this.vm.currentLocale === 'en-US' ? TiviColors.lightSecondary : Color.Transparent)
        .onClick(async () => {
          await this.vm.setLocale('en-US');
          this.showLanguagePicker = false;
        })

        // Chinese option
        Row() {
          Text('中文')
            .fontSize(TiviTypography.body)
            .layoutWeight(1)

          if (this.vm.currentLocale === 'zh-CN') {
            SymbolGlyph($r('sys.symbol.checkmark'))
              .fontSize(18)
              .fontColor([TiviColors.lightPrimary])
          }
        }
        .width('100%')
        .padding(TiviSpacing.lg)
        .borderRadius(TiviRadius.md)
        .backgroundColor(this.vm.currentLocale === 'zh-CN' ? TiviColors.lightSecondary : Color.Transparent)
        .onClick(async () => {
          await this.vm.setLocale('zh-CN');
          this.showLanguagePicker = false;
        })

        Blank()
          .height(TiviSpacing.xxl)
      }
      .width('100%')
      .padding({ left: TiviSpacing.xxl, right: TiviSpacing.xxl })
      .backgroundColor(TiviColors.lightBackground)
      .borderRadius({ topLeft: TiviRadius.xl, topRight: TiviRadius.xl })
      .alignItems(HorizontalAlign.Center)
    }
    .width('100%')
    .height('100%')
    .position({ x: 0, y: 0 })
  }
}
