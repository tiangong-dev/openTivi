/// Normalize a channel name for cross-source grouping.
/// Conservative: only strips whitespace, hyphens, underscores, lowercases.
pub fn normalize_channel_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_normalization() {
        assert_eq!(normalize_channel_name("CCTV-1"), "cctv1");
        assert_eq!(normalize_channel_name("cctv 1"), "cctv1");
        assert_eq!(normalize_channel_name("CCTV_1"), "cctv1");
        assert_eq!(normalize_channel_name("  cctv-1  "), "cctv1");
    }

    #[test]
    fn test_preserves_hd_suffix() {
        assert_ne!(
            normalize_channel_name("CCTV-1"),
            normalize_channel_name("CCTV-1 HD")
        );
    }

    #[test]
    fn test_unicode_names() {
        assert_eq!(normalize_channel_name("湖南卫视"), "湖南卫视");
        assert_eq!(normalize_channel_name("湖南 卫视"), "湖南卫视");
    }
}
