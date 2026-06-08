pub fn normalize_epg_key(value: &str) -> String {
    let mut lowered = value.trim().to_lowercase();
    for token in ["高清", "超清", "标清", "频道", "hd", "uhd", "4k"] {
        lowered = lowered.replace(token, "");
    }

    let mut out = String::new();
    for ch in lowered.chars() {
        let is_hanzi = ('\u{4e00}'..='\u{9fff}').contains(&ch);
        if ch.is_ascii_alphanumeric() || is_hanzi {
            out.push(ch);
        }
    }
    out
}

pub fn build_channel_candidates(
    tvg_id: Option<&str>,
    tvg_name: Option<&str>,
    channel_name: &str,
) -> Vec<String> {
    let mut candidates: Vec<String> = Vec::new();
    add_candidate(&mut candidates, tvg_id);
    add_candidate(&mut candidates, tvg_name);
    add_candidate(&mut candidates, Some(channel_name));
    candidates
}

pub fn merge_mapped_ids(candidates: &mut Vec<String>, mapped_ids: Vec<String>) {
    for id in mapped_ids {
        push_unique(candidates, id.to_ascii_lowercase());
        push_unique(candidates, normalize_epg_key(&id));
    }
}

fn add_candidate(candidates: &mut Vec<String>, value: Option<&str>) {
    let Some(raw) = value else {
        return;
    };

    let lower = raw.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return;
    }
    push_unique(candidates, lower.clone());
    push_unique(candidates, lower.replace(' ', ""));

    let normalized = normalize_epg_key(raw);
    push_unique(candidates, normalized.clone());

    if let Some((head, _)) = lower.split_once('.') {
        push_unique(candidates, head.trim().to_string());
    }
    if let Some(cctv_key) = extract_cctv_key(&normalized) {
        push_unique(candidates, cctv_key);
    }
}

fn extract_cctv_key(value: &str) -> Option<String> {
    let pos = value.find("cctv")?;
    let tail = &value[pos + 4..];
    let mut key = String::from("cctv");
    for ch in tail.chars() {
        if ch.is_ascii_digit() {
            key.push(ch);
            continue;
        }
        if ch == 'k' && key.len() > 4 {
            key.push('k');
        }
        break;
    }
    if key.len() > 4 {
        Some(key)
    } else {
        None
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !value.is_empty() && !values.iter().any(|v| v == &value) {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_epg_key() {
        assert_eq!(normalize_epg_key(" CCTV1-综合高清 "), "cctv1综合");
        assert_eq!(normalize_epg_key("东方卫视频道"), "东方卫视");
    }

    #[test]
    fn test_build_channel_candidates_contains_cctv_short_key() {
        let candidates = build_channel_candidates(None, None, "CCTV13-新闻");
        assert!(candidates.iter().any(|c| c == "cctv13"));
    }
}
