import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus } from '../common/Theme';

/**
 * Import dialog for adding IPTV sources. Supports M3U, Xtream, and XMLTV.
 * Displays as a centered modal dialog with focusable input fields.
 */

export enum ImportType {
  M3U = 0,
  Xtream = 1,
  XMLTV = 2
}

@CustomDialog
export struct ImportDialog {
  controller: CustomDialogController;
  @State selectedType: ImportType = ImportType.M3U;
  @State name: string = '';
  @State location: string = '';
  @State serverUrl: string = '';
  @State username: string = '';
  @State password: string = '';
  @State isBusy: boolean = false;

  onImportM3u: (name: string, url: string) => void = () => {};
  onImportXtream: (name: string, server: string, username: string, password: string) => void = () => {};
  onImportXmltv: (name: string, location: string) => void = () => {};

  build() {
    Column() {
      // Dialog title
      Text($r('app.string.sources_add'))
        .fontSize(TiviTypo.h2Size)
        .fontWeight(TiviTypo.weightBold)
        .fontColor(TiviColors.foreground)
        .margin({ bottom: TiviSpacing.lg })

      // Type selector tabs
      Row({ space: TiviSpacing.sm }) {
        this.TypeTabBuilder($r('app.string.sources_import_m3u'), ImportType.M3U)
        this.TypeTabBuilder($r('app.string.sources_import_xtream'), ImportType.Xtream)
        this.TypeTabBuilder($r('app.string.sources_import_xmltv'), ImportType.XMLTV)
      }
      .margin({ bottom: TiviSpacing.lg })

      // Name field (common to all types)
      this.InputFieldBuilder($r('app.string.sources_name'), this.name, (value: string) => {
        this.name = value;
      })

      // Type-specific fields
      if (this.selectedType === ImportType.M3U) {
        this.InputFieldBuilder($r('app.string.sources_url'), this.location, (value: string) => {
          this.location = value;
        })
      } else if (this.selectedType === ImportType.Xtream) {
        this.InputFieldBuilder($r('app.string.sources_server_url'), this.serverUrl, (value: string) => {
          this.serverUrl = value;
        })
        this.InputFieldBuilder($r('app.string.sources_username'), this.username, (value: string) => {
          this.username = value;
        })
        this.InputFieldBuilder($r('app.string.sources_password'), this.password, (value: string) => {
          this.password = value;
        }, true)
      } else {
        this.InputFieldBuilder($r('app.string.sources_url'), this.location, (value: string) => {
          this.location = value;
        })
      }

      // Action buttons
      Row({ space: TiviSpacing.base }) {
        Button($r('app.string.cancel'))
          .fontSize(TiviTypo.bodyLargeSize)
          .fontColor(TiviColors.foreground)
          .backgroundColor(TiviColors.secondary)
          .borderRadius(TiviRadius.md)
          .height(44)
          .focusable(true)
          .onClick(() => {
            this.controller.close();
          })
          .stateStyles({
            focused: {
              .border({ width: 2, color: TiviColors.focusBorder, style: BorderStyle.Solid })
            },
            normal: {
              .border({ width: 0, color: TiviColors.transparent })
            }
          })

        Button(this.isBusy ? $r('app.string.sources_importing') : $r('app.string.confirm'))
          .fontSize(TiviTypo.bodyLargeSize)
          .fontColor(TiviColors.primaryForeground)
          .backgroundColor(TiviColors.primary)
          .borderRadius(TiviRadius.md)
          .height(44)
          .focusable(true)
          .enabled(!this.isBusy)
          .onClick(() => {
            this.handleImport();
          })
          .stateStyles({
            focused: {
              .border({ width: 2, color: TiviColors.foreground, style: BorderStyle.Solid })
            },
            normal: {
              .border({ width: 0, color: TiviColors.transparent })
            }
          })
      }
      .margin({ top: TiviSpacing.lg })
      .justifyContent(FlexAlign.End)
      .width('100%')
    }
    .width(520)
    .padding(TiviSpacing.lg)
    .backgroundColor(TiviColors.popover)
    .borderRadius(TiviRadius.xl)
    .border({ width: 1, color: TiviColors.border })
  }

  @Builder
  TypeTabBuilder(label: ResourceStr, type: ImportType) {
    Text(label)
      .fontSize(TiviTypo.smallSize)
      .fontWeight(this.selectedType === type ? TiviTypo.weightSemibold : TiviTypo.weightRegular)
      .fontColor(this.selectedType === type ? TiviColors.primaryForeground : TiviColors.foreground)
      .backgroundColor(this.selectedType === type ? TiviColors.primary : TiviColors.secondary)
      .borderRadius(TiviRadius.xxl)
      .padding({
        left: TiviSpacing.base,
        right: TiviSpacing.base,
        top: TiviSpacing.sm,
        bottom: TiviSpacing.sm
      })
      .focusable(true)
      .onClick(() => {
        this.selectedType = type;
      })
      .stateStyles({
        focused: {
          .border({ width: 2, color: TiviColors.focusBorder, style: BorderStyle.Solid })
        },
        normal: {
          .border({ width: 0, color: TiviColors.transparent })
        }
      })
  }

  @Builder
  InputFieldBuilder(label: ResourceStr, value: string, onChange: (value: string) => void,
    isPassword: boolean = false) {
    Column() {
      Text(label)
        .fontSize(TiviTypo.smallSize)
        .fontColor(TiviColors.mutedForeground)
        .margin({ bottom: TiviSpacing.xs })

      TextInput({ text: value, placeholder: '' })
        .fontSize(TiviTypo.bodySize)
        .fontColor(TiviColors.foreground)
        .backgroundColor(TiviColors.secondary)
        .borderRadius(TiviRadius.md)
        .height(44)
        .width('100%')
        .type(isPassword ? InputType.Password : InputType.Normal)
        .onChange(onChange)
        .focusable(true)
        .stateStyles({
          focused: {
            .border({ width: 2, color: TiviColors.focusBorder, style: BorderStyle.Solid })
          },
          normal: {
            .border({ width: 1, color: TiviColors.border })
          }
        })
    }
    .width('100%')
    .margin({ bottom: TiviSpacing.md })
  }

  private handleImport(): void {
    if (!this.name.trim()) return;
    this.isBusy = true;

    switch (this.selectedType) {
      case ImportType.M3U:
        if (this.location.trim()) {
          this.onImportM3u(this.name.trim(), this.location.trim());
        }
        break;
      case ImportType.Xtream:
        if (this.serverUrl.trim() && this.username.trim() && this.password.trim()) {
          this.onImportXtream(this.name.trim(), this.serverUrl.trim(),
            this.username.trim(), this.password.trim());
        }
        break;
      case ImportType.XMLTV:
        if (this.location.trim()) {
          this.onImportXmltv(this.name.trim(), this.location.trim());
        }
        break;
    }
  }
}
