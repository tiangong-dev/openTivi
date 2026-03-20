package com.opentivi.tv.ui.theme

import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = Accent,
    secondary = AccentVariant,
    background = DarkBackground,
    surface = DarkSurface,
    surfaceVariant = DarkSurfaceVariant,
    onPrimary = DarkBackground,
    onSecondary = DarkBackground,
    onBackground = OnDarkBackground,
    onSurface = OnDarkSurface,
    onSurfaceVariant = OnDarkBackground,
    error = ErrorRed,
)

@Composable
fun OpenTiviTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = TvTypography,
        content = content,
    )
}
