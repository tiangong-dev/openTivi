pub mod m3u;
pub mod xmltv;
pub mod xtream;

/// Normalize a raw catchup `days` string into hours (`days * 24`).
/// Returns `None` for empty / non-numeric input (no panic, no coercion).
pub fn catchup_days_to_hours(raw: &str) -> Option<i64> {
    raw.trim().parse::<f64>().ok().map(|d| (d * 24.0) as i64)
}
