pub mod core;
pub mod dto;
pub mod error;
pub mod platform;

// Re-export rusqlite so downstream crates can use Connection without a direct dependency
pub use rusqlite;
