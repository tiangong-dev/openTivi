use reqwest::StatusCode;
use semver::Version;
use serde::Deserialize;

use crate::dto::AppUpdateInfoDto;
use crate::error::{AppError, AppResult};

const RELEASE_LATEST_URL: &str = "https://api.github.com/repos/tiangong-dev/openTivi/releases/latest";
const TAGS_URL: &str = "https://api.github.com/repos/tiangong-dev/openTivi/tags?per_page=100";
const RELEASES_PAGE_URL: &str = "https://github.com/tiangong-dev/openTivi/releases";

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubTag {
    name: String,
}

pub async fn check_app_update(client: &reqwest::Client) -> AppResult<AppUpdateInfoDto> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let mut latest_version = current_version.clone();
    let mut release_url = RELEASES_PAGE_URL.to_string();
    let mut published_at = None;

    if let Some(release) = fetch_latest_release(client).await? {
        latest_version = normalize_tag(&release.tag_name);
        release_url = release.html_url;
        published_at = release.published_at;
    } else if let Some(tag) = fetch_latest_semver_tag(client).await? {
        latest_version = normalize_tag(&tag.name);
        release_url = format!("{}/tag/{}", RELEASES_PAGE_URL, tag.name);
    }

    let has_update = is_update_available(&current_version, &latest_version)?;

    Ok(AppUpdateInfoDto {
        current_version,
        latest_version,
        has_update,
        release_url,
        published_at,
    })
}

async fn fetch_latest_release(client: &reqwest::Client) -> AppResult<Option<GithubRelease>> {
    let response = client
        .get(RELEASE_LATEST_URL)
        .header(reqwest::header::USER_AGENT, "OpenTivi-Desktop")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "HTTP status {} for {}",
            response.status(),
            RELEASE_LATEST_URL
        )));
    }

    Ok(Some(response.json::<GithubRelease>().await?))
}

async fn fetch_latest_semver_tag(client: &reqwest::Client) -> AppResult<Option<GithubTag>> {
    let response = client
        .get(TAGS_URL)
        .header(reqwest::header::USER_AGENT, "OpenTivi-Desktop")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(AppError::Network(format!(
            "HTTP status {} for {}",
            response.status(),
            TAGS_URL
        )));
    }

    let tags = response.json::<Vec<GithubTag>>().await?;
    let mut semver_tags: Vec<(Version, GithubTag)> = Vec::new();
    for tag in tags {
        let normalized = normalize_tag(&tag.name);
        if let Ok(version) = Version::parse(&normalized) {
            semver_tags.push((version, tag));
        }
    }
    semver_tags.sort_by(|a, b| b.0.cmp(&a.0));

    Ok(semver_tags.into_iter().next().map(|(_, tag)| tag))
}

fn normalize_tag(tag_name: &str) -> String {
    if let Some(stripped) = tag_name.strip_prefix('v') {
        return stripped.to_string();
    }
    tag_name.to_string()
}

fn is_update_available(current_raw: &str, latest_raw: &str) -> AppResult<bool> {
    let current = parse_semver(current_raw, "current")?;
    let latest = parse_semver(latest_raw, "latest")?;
    Ok(latest > current)
}

fn parse_semver(raw: &str, field_name: &str) -> AppResult<Version> {
    Version::parse(raw).map_err(|e| {
        AppError::Parse(format!(
            "invalid {} version '{}': {}",
            field_name, raw, e
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::{is_update_available, normalize_tag};

    #[test]
    fn normalize_tag_removes_v_prefix() {
        assert_eq!(normalize_tag("v1.2.3"), "1.2.3");
        assert_eq!(normalize_tag("1.2.3"), "1.2.3");
    }

    #[test]
    fn semver_comparison_works_for_stable_versions() {
        let has_update = is_update_available("0.1.0", "0.2.0").unwrap();
        assert!(has_update);
    }

    #[test]
    fn semver_comparison_handles_prerelease() {
        let has_update = is_update_available("0.2.0-beta.1", "0.2.0").unwrap();
        assert!(has_update);
    }
}
