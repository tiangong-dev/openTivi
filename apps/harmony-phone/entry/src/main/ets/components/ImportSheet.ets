import { SourcesViewModel } from '../viewmodels/SourcesViewModel';
import { TiviColors, TiviTypography, TiviSpacing, TiviRadius } from '../common/Theme';

@Component
export struct ImportSheet {
  @Link vm: SourcesViewModel;
  onDismiss: () => void = () => {};
  @State selectedTab: number = 0; // 0=M3U, 1=Xtream, 2=XMLTV
  @State name: string = '';
  @State location: string = '';
  @State serverUrl: string = '';
  @State username: string = '';
  @State password: string = '';
  @State autoRefreshMinutes: string = '';
  @State isImporting: boolean = false;

  build() {
    Column({ space: TiviSpacing.lg }) {
      // Handle bar
      Row()
        .width(36)
        .height(4)
        .borderRadius(2)
        .backgroundColor(TiviColors.lightMuted)
        .margin({ top: TiviSpacing.sm })

      // Title
      Text($r('app.string.sources_add'))
        .fontSize(TiviTypography.h3)
        .fontWeight(FontWeight.Bold)

      // Tab selector
      Row({ space: 0 }) {
        this.TabButton({ label: 'M3U', index: 0 })
        this.TabButton({ label: 'Xtream', index: 1 })
        this.TabButton({ label: 'XMLTV', index: 2 })
      }
      .width('100%')
      .backgroundColor(TiviColors.lightSecondary)
      .borderRadius(TiviRadius.md)
      .padding(2)

      // Form fields based on selected tab
      if (this.selectedTab === 0) {
        this.M3uForm()
      } else if (this.selectedTab === 1) {
        this.XtreamForm()
      } else {
        this.XmltvForm()
      }

      // Import button
      Button(this.isImporting ? $r('app.string.sources_importing') : $r('app.string.sources_add'))
        .width('100%')
        .height(48)
        .backgroundColor(TiviColors.lightPrimary)
        .fontColor(TiviColors.lightPrimaryForeground)
        .borderRadius(TiviRadius.lg)
        .enabled(!this.isImporting)
        .onClick(async () => {
          await this.doImport();
        })

      // Status message
      if (this.vm.importMessage.length > 0) {
        Text(this.vm.importMessage)
          .fontSize(TiviTypography.small)
          .fontColor(TiviColors.lightMutedForeground)
          .width('100%')
          .textAlign(TextAlign.Center)
      }
    }
    .width('100%')
    .padding(TiviSpacing.xxl)
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  TabButton($$: { label: string, index: number }) {
    Text($$.label)
      .fontSize(TiviTypography.small)
      .fontWeight(this.selectedTab === $$.index ? FontWeight.Medium : FontWeight.Normal)
      .fontColor(this.selectedTab === $$.index ? TiviColors.lightPrimaryForeground : TiviColors.lightForeground)
      .backgroundColor(this.selectedTab === $$.index ? TiviColors.lightPrimary : Color.Transparent)
      .borderRadius(TiviRadius.sm)
      .padding({ left: TiviSpacing.lg, right: TiviSpacing.lg, top: TiviSpacing.sm, bottom: TiviSpacing.sm })
      .layoutWeight(1)
      .textAlign(TextAlign.Center)
      .onClick(() => {
        this.selectedTab = $$.index;
        this.clearForm();
      })
  }

  @Builder
  M3uForm() {
    Column({ space: TiviSpacing.md }) {
      TextInput({ placeholder: $r('app.string.sources_name') })
        .onChange((v: string) => { this.name = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)

      TextInput({ placeholder: $r('app.string.sources_url') })
        .onChange((v: string) => { this.location = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)

      TextInput({ placeholder: $r('app.string.sources_auto_refresh_placeholder') })
        .type(InputType.Number)
        .onChange((v: string) => { this.autoRefreshMinutes = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)
    }
  }

  @Builder
  XtreamForm() {
    Column({ space: TiviSpacing.md }) {
      TextInput({ placeholder: $r('app.string.sources_name') })
        .onChange((v: string) => { this.name = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)

      TextInput({ placeholder: $r('app.string.sources_server_url') })
        .onChange((v: string) => { this.serverUrl = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)

      TextInput({ placeholder: $r('app.string.sources_username') })
        .onChange((v: string) => { this.username = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)

      TextInput({ placeholder: $r('app.string.sources_password') })
        .type(InputType.Password)
        .onChange((v: string) => { this.password = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)
    }
  }

  @Builder
  XmltvForm() {
    Column({ space: TiviSpacing.md }) {
      TextInput({ placeholder: $r('app.string.sources_name') })
        .onChange((v: string) => { this.name = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)

      TextInput({ placeholder: $r('app.string.sources_url') })
        .onChange((v: string) => { this.location = v; })
        .width('100%')
        .borderRadius(TiviRadius.md)
    }
  }

  private clearForm(): void {
    this.name = '';
    this.location = '';
    this.serverUrl = '';
    this.username = '';
    this.password = '';
    this.autoRefreshMinutes = '';
    this.vm.importMessage = '';
  }

  private async doImport(): Promise<void> {
    this.isImporting = true;
    try {
      if (this.selectedTab === 0) {
        const refreshMin = this.autoRefreshMinutes.length > 0 ? parseInt(this.autoRefreshMinutes) : null;
        await this.vm.importM3u(this.name || 'My IPTV', this.location, refreshMin);
      } else if (this.selectedTab === 1) {
        await this.vm.importXtream(this.name || 'My Xtream', this.serverUrl, this.username, this.password);
      } else {
        await this.vm.importXmltv(this.name || 'My EPG', this.location);
      }
      this.clearForm();
      this.onDismiss();
    } catch (e) {
      // Error handled by viewmodel
    } finally {
      this.isImporting = false;
    }
  }
}
