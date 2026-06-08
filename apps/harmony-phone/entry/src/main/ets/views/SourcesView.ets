import { SourcesViewModel } from '../viewmodels/SourcesViewModel';
import { SourceInfo } from '../models/Types';
import { ImportSheet } from '../components/ImportSheet';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';
import { AppConstants } from '../common/Constants';

@Component
export struct SourcesView {
  @State vm: SourcesViewModel = new SourcesViewModel();
  @State showImportSheet: boolean = false;
  @State isRefreshingAll: boolean = false;
  @State showDeleteDialog: boolean = false;
  @State sourceToDelete: SourceInfo | undefined = undefined;

  aboutToAppear(): void {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    await this.vm.load();
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Column() {
        // Title bar
        Row() {
          Text($r('app.string.sources_title'))
            .fontSize(TiviTypography.h1)
            .fontWeight(FontWeight.Bold)
            .layoutWeight(1)

          // Refresh all button
          if (this.vm.sources.length > 0) {
            if (this.isRefreshingAll) {
              LoadingProgress()
                .width(22)
                .height(22)
                .margin({ right: TiviSpacing.lg })
            } else {
              SymbolGlyph($r('sys.symbol.arrow_clockwise'))
                .fontSize(22)
                .fontColor([TiviColors.lightForeground])
                .margin({ right: TiviSpacing.lg })
                .onClick(async () => {
                  this.isRefreshingAll = true;
                  await this.vm.refreshAllSources();
                  this.isRefreshingAll = false;
                })
            }
          }

          SymbolGlyph($r('sys.symbol.plus'))
            .fontSize(22)
            .fontColor([TiviColors.lightPrimary])
            .onClick(() => {
              this.showImportSheet = true;
            })
        }
        .width('100%')
        .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.md, bottom: TiviSpacing.md })

        if (this.vm.isLoading && this.vm.sources.length === 0) {
          Column() {
            LoadingProgress()
              .width(48)
              .height(48)
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else if (this.vm.sources.length === 0 && !this.vm.isLoading) {
          // Empty state
          Column({ space: TiviSpacing.md }) {
            SymbolGlyph($r('sys.symbol.antenna_radiowaves_left_and_right'))
              .fontSize(32)
              .fontColor([TiviColors.lightMutedForeground])

            Text($r('app.string.sources_title'))
              .fontSize(TiviTypography.h3)
              .fontWeight(FontWeight.Medium)

            Text($r('app.string.sources_empty'))
              .fontSize(TiviTypography.small)
              .fontColor(TiviColors.lightMutedForeground)
              .textAlign(TextAlign.Center)
              .padding({ left: TiviSpacing.xxxl, right: TiviSpacing.xxxl })
          }
          .width('100%')
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .alignItems(HorizontalAlign.Center)
        } else {
          Refresh({ refreshing: $$this.vm.isLoading }) {
            List() {
              ForEach(this.vm.sources, (source: SourceInfo) => {
                ListItem() {
                  this.SourceRow(source)
                }
                .swipeAction({
                  end: this.SwipeActionsBuilder(source)
                })
              }, (source: SourceInfo) => source.id.toString())
            }
            .width('100%')
            .layoutWeight(1)
            .divider({
              strokeWidth: 0.5,
              color: TiviColors.lightBorder,
              startMargin: TiviSpacing.lg,
              endMargin: TiviSpacing.lg
            })
          }
          .onRefreshing(async () => {
            await this.loadData();
          })
          .layoutWeight(1)
        }

        // Status message
        if (this.vm.importMessage.length > 0) {
          Text(this.vm.importMessage)
            .fontSize(TiviTypography.small)
            .fontColor(TiviColors.lightMutedForeground)
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding(TiviSpacing.sm)
            .backgroundColor(TiviColors.lightSecondary)
        }
      }
      .width('100%')
      .height('100%')

      // Import sheet (bottom sheet)
      if (this.showImportSheet) {
        Column() {
          // Overlay background
          Column()
            .width('100%')
            .layoutWeight(1)
            .backgroundColor(TiviColors.overlayShadow)
            .onClick(() => {
              this.showImportSheet = false;
            })

          // Sheet content
          Column() {
            ImportSheet({
              vm: $vm,
              onDismiss: () => {
                this.showImportSheet = false;
              }
            })
          }
          .width('100%')
          .backgroundColor(TiviColors.lightBackground)
          .borderRadius({ topLeft: TiviRadius.xl, topRight: TiviRadius.xl })
          .transition(TransitionEffect.move(TransitionEdge.BOTTOM).animation({
            duration: AppConstants.ANIM_SLOW,
            curve: Curve.EaseOut
          }))
        }
        .width('100%')
        .height('100%')
        .position({ x: 0, y: 0 })
      }

      // Delete confirmation dialog
      if (this.showDeleteDialog && this.sourceToDelete) {
        this.DeleteConfirmDialog()
      }
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  SourceRow(source: SourceInfo) {
    Column({ space: TiviSpacing.xs }) {
      Row() {
        Text(source.name)
          .fontSize(TiviTypography.body)
          .fontWeight(FontWeight.Medium)
          .layoutWeight(1)

        Text(source.kind.toUpperCase())
          .fontSize(TiviTypography.badge)
          .fontWeight(FontWeight.Bold)
          .fontColor(TiviColors.lightPrimary)
          .backgroundColor(TiviColors.primarySoft)
          .padding({ left: 6, right: 6, top: 2, bottom: 2 })
          .borderRadius(4)
      }
      .width('100%')

      // Overview
      if (source.kind.toLowerCase() === 'xmltv') {
        Text(`EPG programs: ${source.epgProgramCount}`)
          .fontSize(TiviTypography.caption)
          .fontColor(TiviColors.lightMutedForeground)
      } else {
        Text(`${source.channelCount} channels \u00B7 ${source.groupCount} groups`)
          .fontSize(TiviTypography.caption)
          .fontColor(TiviColors.lightMutedForeground)
      }

      if (source.lastImportedAt) {
        Text(`Last import: ${source.lastImportedAt}`)
          .fontSize(TiviTypography.badge)
          .fontColor(TiviColors.lightMutedForeground)
      }
    }
    .width('100%')
    .padding({ top: TiviSpacing.md, bottom: TiviSpacing.md, left: TiviSpacing.lg, right: TiviSpacing.lg })
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  SwipeActionsBuilder(source: SourceInfo) {
    Row() {
      Button() {
        SymbolGlyph($r('sys.symbol.arrow_clockwise'))
          .fontSize(20)
          .fontColor([TiviColors.overlayText])
      }
      .width(70)
      .height('100%')
      .backgroundColor(TiviColors.lightPrimary)
      .onClick(async () => {
        await this.vm.refreshSource(source.id);
      })

      Button() {
        SymbolGlyph($r('sys.symbol.trash'))
          .fontSize(20)
          .fontColor([TiviColors.overlayText])
      }
      .width(70)
      .height('100%')
      .backgroundColor(TiviColors.lightDestructive)
      .onClick(() => {
        this.sourceToDelete = source;
        this.showDeleteDialog = true;
      })
    }
  }

  @Builder
  DeleteConfirmDialog() {
    Column() {
      Column()
        .width('100%')
        .layoutWeight(1)
        .backgroundColor(TiviColors.overlayShadow)
        .onClick(() => {
          this.showDeleteDialog = false;
          this.sourceToDelete = undefined;
        })

      Column({ space: TiviSpacing.lg }) {
        Text($r('app.string.sources_delete_confirm_title'))
          .fontSize(TiviTypography.h3)
          .fontWeight(FontWeight.Bold)

        Text(`Are you sure you want to delete "${this.sourceToDelete?.name ?? ''}"? This cannot be undone.`)
          .fontSize(TiviTypography.body)
          .fontColor(TiviColors.lightMutedForeground)
          .textAlign(TextAlign.Center)

        Row({ space: TiviSpacing.md }) {
          Button($r('app.string.cancel'))
            .layoutWeight(1)
            .height(44)
            .backgroundColor(TiviColors.lightSecondary)
            .fontColor(TiviColors.lightForeground)
            .borderRadius(TiviRadius.lg)
            .onClick(() => {
              this.showDeleteDialog = false;
              this.sourceToDelete = undefined;
            })

          Button($r('app.string.delete'))
            .layoutWeight(1)
            .height(44)
            .backgroundColor(TiviColors.lightDestructive)
            .fontColor(TiviColors.overlayText)
            .borderRadius(TiviRadius.lg)
            .onClick(async () => {
              if (this.sourceToDelete) {
                await this.vm.deleteSource(this.sourceToDelete!.id);
              }
              this.showDeleteDialog = false;
              this.sourceToDelete = undefined;
            })
        }
        .width('100%')
      }
      .width('100%')
      .padding(TiviSpacing.xxl)
      .backgroundColor(TiviColors.lightBackground)
      .borderRadius({ topLeft: TiviRadius.xl, topRight: TiviRadius.xl })
    }
    .width('100%')
    .height('100%')
    .position({ x: 0, y: 0 })
  }
}
