import { TiviColors, TiviTypo, TiviSpacing, TiviRadius, TiviFocus } from '../common/Theme';
import { ImportDialog } from '../components/ImportDialog';
import { SourcesViewModel } from '../viewmodels/SourcesViewModel';
import { SourceInfo } from '../models/Types';

/**
 * Sources management page. Lists imported IPTV sources and provides
 * import, refresh, and delete actions. Opens an ImportDialog for adding
 * new M3U / Xtream / XMLTV sources.
 */
@Component
export struct SourcesPage {
  @State private vm: SourcesViewModel = new SourcesViewModel();
  private importDialogController: CustomDialogController = new CustomDialogController({
    builder: ImportDialog({
      onImportM3u: (name: string, url: string) => {
        this.vm.importM3u(name, url);
        this.importDialogController.close();
      },
      onImportXtream: (name: string, server: string, username: string, password: string) => {
        this.vm.importXtream(name, server, username, password);
        this.importDialogController.close();
      },
      onImportXmltv: (name: string, location: string) => {
        this.vm.importXmltv(name, location);
        this.importDialogController.close();
      }
    }),
    autoCancel: true,
    alignment: DialogAlignment.Center,
    customStyle: true
  });

  aboutToAppear(): void {
    this.vm.loadSources();
  }

  build() {
    Column() {
      // Header: title + add button
      Row() {
        Text($r('app.string.sources_title'))
          .fontSize(TiviTypo.h1Size)
          .fontWeight(TiviTypo.weightBold)
          .fontColor(TiviColors.foreground)

        Blank()

        Button($r('app.string.sources_add'))
          .fontSize(TiviTypo.bodySize)
          .fontColor(TiviColors.primaryForeground)
          .backgroundColor(TiviColors.primary)
          .borderRadius(TiviRadius.md)
          .height(40)
          .focusable(true)
          .onClick(() => {
            this.importDialogController.open();
          })
          .stateStyles({
            focused: {
              .border({ width: 2, color: TiviColors.foreground, style: BorderStyle.Solid })
              .scale({ x: 1.05, y: 1.05 })
            },
            normal: {
              .border({ width: 0, color: TiviColors.transparent })
              .scale({ x: 1.0, y: 1.0 })
            }
          })
          .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
      }
      .width('100%')

      // Status message
      if (this.vm.message) {
        Text(this.vm.message)
          .fontSize(TiviTypo.bodySize)
          .fontColor(TiviColors.foreground)
          .backgroundColor(TiviColors.secondary)
          .padding(TiviSpacing.sm)
          .borderRadius(TiviRadius.sm)
          .margin({ top: TiviSpacing.sm })
          .width('100%')
      }

      // Loading indicator
      if (this.vm.busy) {
        Row({ space: TiviSpacing.sm }) {
          LoadingProgress()
            .width(24)
            .height(24)
            .color(TiviColors.primary)
          Text($r('app.string.sources_importing'))
            .fontSize(TiviTypo.bodySize)
            .fontColor(TiviColors.mutedForeground)
        }
        .margin({ top: TiviSpacing.sm })
      }

      // Empty state
      if (this.vm.sources.length === 0 && !this.vm.busy) {
        Column() {
          SymbolGlyph($r('sys.symbol.folder'))
            .fontSize(TiviTypo.iconHugeSize)
            .fontColor([TiviColors.mutedForeground])
          Text($r('app.string.sources_empty'))
            .fontSize(TiviTypo.bodyLargeSize)
            .fontColor(TiviColors.mutedForeground)
            .margin({ top: TiviSpacing.base })
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .margin({ top: 64 })
        .alignItems(HorizontalAlign.Center)
      }

      // Sources list
      if (this.vm.sources.length > 0) {
        List({ space: TiviSpacing.md }) {
          ForEach(this.vm.sources, (source: SourceInfo) => {
            ListItem() {
              this.SourceRow(source)
            }
          }, (source: SourceInfo) => source.id.toString())
        }
        .width('100%')
        .layoutWeight(1)
        .margin({ top: TiviSpacing.lg })
      }
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
  SourceRow(source: SourceInfo) {
    Column() {
      Row() {
        Column() {
          // Source name
          Text(source.name)
            .fontSize(TiviTypo.h3Size)
            .fontWeight(TiviTypo.weightSemibold)
            .fontColor(TiviColors.foreground)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })

          // Source type and stats
          Row({ space: TiviSpacing.base }) {
            Text(source.kind.toUpperCase())
              .fontSize(TiviTypo.captionSize)
              .fontWeight(TiviTypo.weightSemibold)
              .fontColor(TiviColors.primary)
              .backgroundColor(TiviColors.secondary)
              .padding({ left: TiviSpacing.sm, right: TiviSpacing.sm, top: 2, bottom: 2 })
              .borderRadius(TiviRadius.sm)

            Text(`${source.channelCount} channels, ${source.groupCount} groups`)
              .fontSize(TiviTypo.smallSize)
              .fontColor(TiviColors.mutedForeground)
          }
          .margin({ top: TiviSpacing.xs })

          // Status
          Row({ space: TiviSpacing.sm }) {
            Circle()
              .width(8)
              .height(8)
              .fill(source.enabled ? TiviColors.success : TiviColors.destructive)
            Text(source.enabled ? 'Healthy' : 'Disabled')
              .fontSize(TiviTypo.captionSize)
              .fontColor(TiviColors.mutedForeground)
          }
          .margin({ top: TiviSpacing.xs })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)

        // Action buttons
        Row({ space: TiviSpacing.sm }) {
          // Refresh button
          Button($r('app.string.sources_refresh'))
            .fontSize(TiviTypo.smallSize)
            .fontColor(TiviColors.foreground)
            .backgroundColor(TiviColors.secondary)
            .borderRadius(TiviRadius.md)
            .height(36)
            .enabled(!this.vm.busy)
            .focusable(true)
            .onClick(() => {
              this.vm.refreshSource(source.id);
            })
            .stateStyles({
              focused: {
                .border({ width: 2, color: TiviColors.focusBorder, style: BorderStyle.Solid })
              },
              normal: {
                .border({ width: 0, color: TiviColors.transparent })
              }
            })

          // Delete button
          Button($r('app.string.sources_delete'))
            .fontSize(TiviTypo.smallSize)
            .fontColor(TiviColors.destructiveForeground)
            .backgroundColor(TiviColors.destructive)
            .borderRadius(TiviRadius.md)
            .height(36)
            .enabled(!this.vm.busy)
            .focusable(true)
            .onClick(() => {
              this.vm.deleteSource(source.id);
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
      }
      .width('100%')
    }
    .width('100%')
    .padding(TiviSpacing.base)
    .backgroundColor(TiviColors.card)
    .borderRadius(TiviRadius.lg)
    .focusable(true)
    .stateStyles({
      focused: {
        .border({ width: TiviFocus.borderWidth, color: TiviColors.focusBorder, style: BorderStyle.Solid })
      },
      normal: {
        .border({ width: 1, color: TiviColors.border })
      }
    })
    .animation({ duration: TiviFocus.animDuration, curve: Curve.EaseInOut })
  }
}
