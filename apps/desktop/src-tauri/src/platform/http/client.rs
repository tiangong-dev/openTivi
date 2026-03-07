use crate::error::AppResult;

pub fn fetch_text(url: &str) -> AppResult<String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(8))
        .timeout(std::time::Duration::from_secs(20))
        .build()?;
    let response = client.get(url).send()?.error_for_status()?;
    let text = response.text()?;
    Ok(text)
}
