use crate::error::AppResult;

pub fn fetch_text(url: &str) -> AppResult<String> {
    let response = reqwest::blocking::get(url)?;
    let text = response.text()?;
    Ok(text)
}
