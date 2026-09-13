//! Filesystem store for Broadcast Studio assets (logos, fonts, images).
//!
//! Files live under `<app data>/broadcast_assets/` and are served by the
//! overlay server at `/assets/{file_name}`. File names are generated (uuid +
//! canonical extension) so user input can never traverse paths, and SVG is
//! rejected on purpose: an uploaded SVG could carry scripts and the overlay
//! server would serve it from the same origin.
//!
//! Metadata lives in the `broadcast_assets` table; this module only owns the
//! bytes on disk.

use std::path::{Path, PathBuf};

const MAX_ASSET_BYTES: usize = 12 * 1024 * 1024;

/// Kinds the UI can upload, mapped to their accepted MIME types.
const IMAGE_MIMES: &[&str] = &["image/png", "image/jpeg", "image/webp", "image/gif"];
const FONT_MIMES: &[&str] = &[
    "font/woff2",
    "font/woff",
    "font/ttf",
    "font/otf",
    "application/font-woff2",
    "application/x-font-ttf",
    "application/x-font-opentype",
];
const AUDIO_MIMES: &[&str] = &["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"];

#[derive(Clone, Debug)]
pub struct AssetStore {
    root: PathBuf,
}

impl AssetStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn ensure(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.root)
    }

    /// Reads an asset by its stored file name. Returns `(bytes, mime)`.
    pub fn read(&self, file_name: &str) -> Option<(Vec<u8>, String)> {
        let safe = safe_file_name(file_name)?;
        let path = self.root.join(&safe);
        let bytes = std::fs::read(path).ok()?;
        let mime = mime_guess::from_path(&safe).first_or_octet_stream();
        Some((bytes, mime.as_ref().to_string()))
    }

    /// Stores bytes and returns `(file_name, mime)`. `mime` must be one of the
    /// accepted types for the given kind.
    pub fn save(&self, kind: &str, mime: &str, bytes: &[u8]) -> Result<(String, String), String> {
        if bytes.is_empty() {
            return Err("El archivo está vacío".into());
        }
        if bytes.len() > MAX_ASSET_BYTES {
            return Err(format!(
                "El archivo supera el límite de {} MB",
                MAX_ASSET_BYTES / (1024 * 1024)
            ));
        }
        let mime = normalize_mime(mime);
        let allowed = match kind {
            "logo" | "image" => IMAGE_MIMES,
            "font" => FONT_MIMES,
            "audio" => AUDIO_MIMES,
            other => return Err(format!("Tipo de asset no soportado: {other}")),
        };
        if !allowed.contains(&mime.as_str()) {
            return Err(format!("Formato no soportado para {kind}: {mime}"));
        }

        let extension = extension_for(&mime).ok_or_else(|| "Formato desconocido".to_string())?;
        let file_name = format!("{}.{}", uuid::Uuid::new_v4().simple(), extension);
        self.ensure().map_err(|error| error.to_string())?;
        std::fs::write(self.root.join(&file_name), bytes).map_err(|error| error.to_string())?;
        Ok((file_name, mime))
    }

    pub fn delete(&self, file_name: &str) -> Result<(), String> {
        let Some(safe) = safe_file_name(file_name) else {
            return Err("Nombre de archivo inválido".into());
        };
        let path = self.root.join(safe);
        if path.exists() {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

/// Normalizes MIME aliases sent by browsers (`image/jpg`, etc.).
fn normalize_mime(mime: &str) -> String {
    let mime = mime.trim().to_ascii_lowercase();
    match mime.as_str() {
        "image/jpg" | "image/pjpeg" => "image/jpeg".to_string(),
        "application/font-woff" => "font/woff".to_string(),
        "application/octet-stream" => "application/octet-stream".to_string(),
        other => other.to_string(),
    }
}

fn extension_for(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "font/woff2" | "application/font-woff2" => Some("woff2"),
        "font/woff" => Some("woff"),
        "font/ttf" | "application/x-font-ttf" => Some("ttf"),
        "font/otf" | "application/x-font-opentype" => Some("otf"),
        "audio/mpeg" => Some("mp3"),
        "audio/ogg" => Some("ogg"),
        "audio/wav" | "audio/x-wav" => Some("wav"),
        _ => None,
    }
}

/// Only allows `[A-Za-z0-9._-]`, no separators, no leading dot.
fn safe_file_name(file_name: &str) -> Option<String> {
    let name = file_name.trim();
    if name.is_empty() || name.starts_with('.') || name.len() > 128 {
        return None;
    }
    if !name
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return None;
    }
    Some(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(name: &str) -> AssetStore {
        let dir = std::env::temp_dir().join(format!(
            "rl-stats-assets-{}-{}-{}",
            name,
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        AssetStore::new(dir)
    }

    #[test]
    fn saves_and_reads_an_image() {
        let store = temp_store("image");
        let (file_name, mime) = store.save("logo", "image/png", b"png-bytes").unwrap();
        assert!(file_name.ends_with(".png"));
        assert_eq!(mime, "image/png");
        let (bytes, read_mime) = store.read(&file_name).unwrap();
        assert_eq!(bytes, b"png-bytes");
        assert_eq!(read_mime, "image/png");
        store.delete(&file_name).unwrap();
        assert!(store.read(&file_name).is_none());
    }

    #[test]
    fn rejects_unsupported_formats_and_svg() {
        let store = temp_store("reject");
        assert!(store.save("logo", "image/svg+xml", b"<svg/>").is_err());
        assert!(store.save("font", "image/png", b"png").is_err());
        assert!(store.save("image", "application/pdf", b"pdf").is_err());
        assert!(store.save("image", "image/png", b"").is_err());
    }

    #[test]
    fn path_traversal_is_rejected() {
        let store = temp_store("traversal");
        assert!(store.read("../../etc/passwd").is_none());
        assert!(store.read("sub/dir.png").is_none());
        assert!(store.delete("../evil").is_err());
        assert!(safe_file_name(".hidden").is_none());
    }

    #[test]
    fn normalizes_jpg_alias() {
        let store = temp_store("jpg");
        let (file_name, mime) = store.save("image", "image/jpg", b"jpeg").unwrap();
        assert_eq!(mime, "image/jpeg");
        assert!(file_name.ends_with(".jpg"));
    }
}
