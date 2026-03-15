use std::path::PathBuf;
use std::sync::OnceLock;

static EXTERNAL_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_data_dir(path: &str) {
    let _ = EXTERNAL_DATA_DIR.set(PathBuf::from(path));
}

pub fn app_data_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = dirs_next().ok_or("Could not determine app data directory")?;
    Ok(dir)
}

pub fn db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = app_data_dir()?;
    Ok(dir.join("opentivi.db"))
}

fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "android")]
    {
        EXTERNAL_DATA_DIR.get().cloned()
    }
    #[cfg(target_os = "ios")]
    {
        EXTERNAL_DATA_DIR.get().cloned()
    }
    #[cfg(target_os = "macos")]
    {
        dirs::data_dir().map(|d| d.join("com.opentivi.app"))
    }
    #[cfg(target_os = "windows")]
    {
        dirs::data_local_dir().map(|d| d.join("OpenTivi"))
    }
    #[cfg(target_os = "linux")]
    {
        dirs::data_dir().map(|d| d.join("opentivi"))
    }
}
