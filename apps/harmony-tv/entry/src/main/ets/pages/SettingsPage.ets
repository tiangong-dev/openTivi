import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus } from '../common/Theme';
import { SettingsViewModel } from '../viewmodels/SettingsViewModel';

/**
 * Settings page for TV. Uses a simple list layout with focusable rows.
 * Each setting row shows the label and current value; pressing Enter
 * cycles through options (for select-type settings) or toggles booleans.
 */
@Component
export struct SettingsPage {
  @State private vm: SettingsViewModel = new SettingsViewModel();

  aboutToAppear(): void {
    this.vm.loadSettings();
  }

  build() {
    Column() {
      // Title
      Text($r('app.string.settings_title'))
        .fontSize(TiviTypo.h1Size)
        .fontWeight(TiviTypo.weightBold)
        .fontColor(TiviColors.foreground)
        .margin({ bottom: TiviSpacing.lg })

      // General section
      Text($r('app.string.nav_settings'))
        .fontSize(TiviTypo.h3Size)
        .fontWeight(TiviTypo.weightSemibold)
        .fontColor(TiviColors.mutedForeground)
        .margin({ bottom: TiviSpacing.md })

      // Language setting
      this.SettingRow(
        $r('app.string.settings_language'),
        this.vm.languageCode === 'en-US' ? 'English' : '中文',
        () => {
          const next = this.vm.languageCode === 'en-US' ? 'zh-CN' : 'en-US';
          this.vm.setLanguageCode(next);
        }
      )

      // Start view setting
      this.SettingRow(
        $r('app.string.settings_start_view'),
        this.getStartViewLabel(this.vm.startView),
        () => {
          const views = ['channels', 'favorites', 'recents', 'sources'];
          const idx = views.indexOf(this.vm.startView);
          const next = views[(idx + 1) % views.length];
          this.vm.setStartView(next);
        }
      )

      // Instant switch setting
      this.SettingRow(
        $r('app.string.settings_instant_switch'),
        this.vm.instantSwitch ? 'On' : 'Off',
        () => {
          this.vm.setInstantSwitch(!this.vm.instantSwitch);
        }
      )

      Blank()

      // About section
      Text($r('app.string.settings_about'))
        .fontSize(TiviTypo.h3Size)
        .fontWeight(TiviTypo.weightSemibold)
        .fontColor(TiviColors.mutedForeground)
        .margin({ bottom: TiviSpacing.md })

      Row() {
        Text($r('app.string.settings_version'))
          .fontSize(TiviTypo.bodyLargeSize)
          .fontColor(TiviColors.foreground)
        Blank()
        Text('1.0.0')
          .fontSize(TiviTypo.bodySize)
          .fontColor(TiviColors.mutedForeground)
      }
      .width('100%')
      .padding(TiviSpacing.base)
      .backgroundColor(TiviColors.card)
      .borderRadius(TiviRadius.lg)
      .border({ width: 1, color: TiviColors.border })
    }
    .width('100%')
    .height('100%')
    .padding({
      left: TiviSpacing.safeAreaX,
      right: TiviSpacing.safeAreaX,
      top: TiviSpacing.safeAreaY,
      bottom: TiviSpacing.safeAreaY
    })
  }

  @Builder
  SettingRow(label: ResourceStr, value: string, onClick: () => void) {
    Row() {
      Text(label)
        .fontSize(TiviTypo.bodyLargeSize)
        .fontWeight(TiviTypo.weightMedium)
        .fontColor(TiviColors.foreground)

      Blank()

      Text(value)
        .fontSize(TiviTypo.bodySize)
        .fontColor(TiviColors.mutedForeground)

      SymbolGlyph($r('sys.symbol.chevron_right'))
        .fontSize(TiviTypo.bodySize)
        .fontColor([TiviColors.mutedForeground])
        .margin({ left: TiviSpacing.sm })
    }
    .width('100%')
    .padding(TiviSpacing.base)
    .backgroundColor(TiviColors.card)
    .borderRadius(TiviRadius.lg)
    .margin({ bottom: TiviSpacing.sm })
    .focusable(true)
    .onClick(onClick)
    .stateStyles({
      focused: {
        .border({ width: TiviFocus.borderWidth, color: TiviColors.focusBorder, style: BorderStyle.Solid })
        .scale({ x: 1.02, y: 1.02 })
      },
      normal: {
        .border({ width: 1, color: TiviColors.border })
        .scale({ x: 1.0, y: 1.0 })
      }
    })
    .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
  }

  private getStartViewLabel(view: string): string {
    switch (view) {
      case 'channels': return 'Channels';
      case 'favorites': return 'Favorites';
      case 'recents': return 'Recents';
      case 'sources': return 'Sources';
      default: return view;
    }
  }
}
