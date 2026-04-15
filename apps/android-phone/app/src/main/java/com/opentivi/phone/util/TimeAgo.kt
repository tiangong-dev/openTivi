package com.opentivi.phone.util

import android.content.Context
import com.opentivi.phone.R
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * Formats an ISO-8601 timestamp string into a human-readable relative time.
 */
fun formatTimeAgo(context: Context, isoTimestamp: String): String {
    return try {
        val then = try {
            ZonedDateTime.parse(isoTimestamp).toInstant()
        } catch (_: Exception) {
            Instant.parse(isoTimestamp)
        }
        val now = Instant.now()
        val minutes = ChronoUnit.MINUTES.between(then, now)
        val hours = ChronoUnit.HOURS.between(then, now)
        val days = ChronoUnit.DAYS.between(then, now)

        when {
            minutes < 1 -> context.getString(R.string.recents_just_now)
            minutes < 60 -> context.getString(R.string.recents_minutes_ago, minutes.toInt())
            hours < 24 -> context.getString(R.string.recents_hours_ago, hours.toInt())
            days < 2 -> context.getString(R.string.recents_yesterday)
            else -> context.getString(R.string.recents_days_ago, days.toInt())
        }
    } catch (_: Exception) {
        isoTimestamp
    }
}
