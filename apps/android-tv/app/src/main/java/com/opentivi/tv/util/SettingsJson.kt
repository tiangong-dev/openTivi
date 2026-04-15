package com.opentivi.tv.util

/**
 * Encode a Kotlin string as a JSON string literal for [uniffi.opentivi.Opentivi.setSetting].
 */
fun jsonString(value: String): String =
    buildString {
        append('"')
        for (ch in value) {
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> append(ch)
            }
        }
        append('"')
    }

fun parseJsonStringSetting(raw: String): String {
    val t = raw.trim()
    if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
        return t.substring(1, t.length - 1)
    }
    return t
}
