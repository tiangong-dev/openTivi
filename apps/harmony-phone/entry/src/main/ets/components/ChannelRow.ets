import { ChannelInfo } from '../models/Types';
import { ChannelLogo } from './ChannelLogo';
import { TiviColors, TiviTypography, TiviSpacing } from '../common/Theme';
import { AppConstants } from '../common/Constants';

@Component
export struct ChannelRow {
  @ObjectLink channel: ChannelInfoObserved;
  onTap: () => void = () => {};
  onFavoriteToggle: () => void = () => {};

  build() {
    Row({ space: TiviSpacing.md }) {
      ChannelLogo({
        url: this.channel.logoUrl ?? '',
        size: AppConstants.LOGO_SIZE_MEDIUM
      })

      Column({ space: 2 }) {
        Row({ space: 4 }) {
          Text(this.channel.name)
            .fontSize(TiviTypography.h4)
            .fontWeight(FontWeight.Medium)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .layoutWeight(1)

          if (this.channel.isFavorite) {
            SymbolGlyph($r('sys.symbol.star_fill'))
              .fontSize(TiviTypography.caption)
              .fontColor([TiviColors.lightFavorite])
          }
        }
        .width('100%')

        if (this.channel.groupName && this.channel.groupName!.length > 0) {
          Text(this.channel.groupName!)
            .fontSize(TiviTypography.caption)
            .fontColor(TiviColors.lightMutedForeground)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      if (this.channel.channelNumber && this.channel.channelNumber!.length > 0) {
        Text(this.channel.channelNumber!)
          .fontSize(TiviTypography.caption)
          .fontColor(TiviColors.lightMutedForeground)
          .fontFamily('monospace')
      }

      SymbolGlyph($r('sys.symbol.play_circle'))
        .fontSize(TiviTypography.h2)
        .fontColor([TiviColors.lightPrimary])
    }
    .width('100%')
    .padding({ top: 8, bottom: 8, left: TiviSpacing.lg, right: TiviSpacing.lg })
    .height(AppConstants.MIN_TOUCH_TARGET + 16)
    .onClick(() => this.onTap())
  }
}

// Observable wrapper for ChannelInfo to use with @ObjectLink
@Observed
export class ChannelInfoObserved {
  id: number;
  sourceId: number;
  name: string;
  channelNumber?: string;
  groupName?: string;
  tvgId?: string;
  logoUrl?: string;
  streamUrl: string;
  isFavorite: boolean;

  constructor(info: ChannelInfo) {
    this.id = info.id;
    this.sourceId = info.sourceId;
    this.name = info.name;
    this.channelNumber = info.channelNumber;
    this.groupName = info.groupName;
    this.tvgId = info.tvgId;
    this.logoUrl = info.logoUrl;
    this.streamUrl = info.streamUrl;
    this.isFavorite = info.isFavorite;
  }

  toChannelInfo(): ChannelInfo {
    return {
      id: this.id,
      sourceId: this.sourceId,
      name: this.name,
      channelNumber: this.channelNumber,
      groupName: this.groupName,
      tvgId: this.tvgId,
      logoUrl: this.logoUrl,
      streamUrl: this.streamUrl,
      isFavorite: this.isFavorite
    };
  }
}
