package com.opentivi.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme

private val DarkColorScheme = darkColorScheme(
    primary = TiviPrimary,
    secondary = TiviSecondary,
    background = TiviBackground,
    surface = TiviCard,
    surfaceVariant = TiviPopover,
    onPrimary = TiviPrimaryForeground,
    onSecondary = TiviSecondaryForeground,
    onBackground = TiviForeground,
    onSurface = TiviCardForeground,
    onSurfaceVariant = TiviMutedForeground,
    error = TiviDestructive,
)

// Material3 (non-TV) dark color scheme — maps all surface variants to design tokens
private val M3DarkColorScheme = androidx.compose.material3.darkColorScheme(
    primary = TiviPrimary,
    onPrimary = TiviPrimaryForeground,
    primaryContainer = TiviPrimary.copy(alpha = 0.15f),
    onPrimaryContainer = TiviPrimary,
    secondary = TiviSecondary,
    onSecondary = TiviSecondaryForeground,
    secondaryContainer = TiviSecondary,
    onSecondaryContainer = TiviSecondaryForeground,
    background = TiviBackground,
    onBackground = TiviForeground,
    surface = TiviCard,
    onSurface = TiviCardForeground,
    surfaceVariant = TiviPopover,
    onSurfaceVariant = TiviMutedForeground,
    // Map all surface container levels to card color for consistency
    surfaceContainerLowest = TiviBackground,
    surfaceContainerLow = TiviCard,
    surfaceContainer = TiviCard,
    surfaceContainerHigh = TiviPopover,
    surfaceContainerHighest = TiviPopover,
    outline = TiviBorder,
    outlineVariant = TiviBorder,
    error = TiviDestructive,
    onError = TiviDestructiveForeground,
)

@Composable
fun OpenTiviTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = TvTypography,
    ) {
        androidx.compose.material3.MaterialTheme(
            colorScheme = M3DarkColorScheme,
            content = content,
        )
    }
}
