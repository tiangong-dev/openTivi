use crate::error::AppResult;

pub async fn fetch_text(client: &reqwest::Client, url: &str) -> AppResult<String> {
    let response = client
        .get(url)
        .send()
        .await?
        .error_for_status()?;
    let text = response.text().await?;
    Ok(text)
}
