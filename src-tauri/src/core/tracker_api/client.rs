use super::models::TrackerProfile;
use crate::error::{AppError, AppResult};
use tracing::{debug, info};

const TRACKER_API_BASE: &str = "https://api.tracker.gg";

pub struct TrackerClient {
    http: reqwest::Client,
    api_key: Option<String>,
}

impl TrackerClient {
    pub fn new(api_key: Option<String>) -> AppResult<Self> {
        let http = reqwest::Client::builder()
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
            )
            .default_headers({
                let mut headers = reqwest::header::HeaderMap::new();
                headers.insert(
                    reqwest::header::ACCEPT,
                    "application/json, text/plain, */*".parse().unwrap(),
                );
                headers.insert(
                    reqwest::header::ACCEPT_LANGUAGE,
                    "es-ES,es;q=0.9,en;q=0.8".parse().unwrap(),
                );
                headers.insert("Sec-Fetch-Dest", "empty".parse().unwrap());
                headers.insert("Sec-Fetch-Mode", "cors".parse().unwrap());
                headers.insert("Sec-Fetch-Site", "same-site".parse().unwrap());
                headers
            })
            .cookie_store(true)
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| AppError::ConnectionError(format!("Failed to create HTTP client: {e}")))?;

        Ok(Self { http, api_key })
    }

    pub async fn fetch_profile(&self, platform: &str, username: &str) -> AppResult<TrackerProfile> {
        let path = format!(
            "/api/v2/rocket-league/standard/profile/{}/{}",
            platform, username
        );

        let url = reqwest::Url::parse(TRACKER_API_BASE)
            .and_then(|base| base.join(&path))
            .map_err(|e| AppError::ParseError(format!("URL invalida: {e}")))?;

        debug!(%url, has_key = self.api_key.is_some(), "Fetching Tracker Network profile");

        let mut req = self
            .http
            .get(url)
            .header("Origin", "https://rocketleague.tracker.network")
            .header("Referer", "https://rocketleague.tracker.network/");

        if let Some(ref key) = self.api_key {
            req = req.header("TRN-Api-Key", key);
        }

        let response = req
            .send()
            .await
            .map_err(|e| AppError::ConnectionError(format!("Error de red: {e}")))?;

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        debug!(status = %status.as_u16(), body_len = body.len(), "Response received");

        if body.contains("You've Been Blocked")
            || body.contains("cf-browser-verify")
            || body.contains("_cf_chl_opt")
        {
            return Err(AppError::ConnectionError(
                "Tracker Network bloqueo la solicitud (proteccion Cloudflare).\n\n\
                Abri el perfil en tu navegador desde Ajustes usando el boton 'Abrir en navegador'."
                    .into(),
            ));
        }

        if status == reqwest::StatusCode::UNAUTHORIZED {
            let msg = if body.contains("No API key found") {
                "La API de Tracker Network requiere una API Key.\n\n\
                Anda a https://tracker.gg/developers, crea una app, copia la key y pegala en Ajustes.".into()
            } else {
                format!(
                    "La API Key fue rechazada.\n\n\
                    Si tu app en tracker.gg/developers dice 'not currently approved':\n\
                    1. Anda a https://tracker.gg/developers\n\
                    2. Edita tu app y completa la informacion del proyecto\n\
                    3. Envia para aprobacion (es gratuito para proyectos hobby/open-source)\n\
                    4. Una vez aprobada, volve a probar\n\n\
                    Respuesta: {}",
                    body.chars().take(200).collect::<String>()
                )
            };
            return Err(AppError::ConfigError(msg));
        }

        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(AppError::ConfigError(format!(
                "Perfil no encontrado: {}/{}. Verifica nombre y plataforma.",
                platform, username
            )));
        }

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AppError::ConnectionError(
                "Demasiadas solicitudes. Espera unos minutos.".into(),
            ));
        }

        if !status.is_success() {
            return Err(AppError::ConnectionError(format!(
                "HTTP {}: {}",
                status.as_u16(),
                body.chars().take(300).collect::<String>()
            )));
        }

        let wrapper: serde_json::Value = serde_json::from_str(&body)
            .map_err(|e| AppError::ParseError(format!("JSON invalido: {e}")))?;

        let data = wrapper
            .get("data")
            .ok_or_else(|| AppError::ParseError("Falta el campo 'data'.".into()))?;

        let profile: TrackerProfile = serde_json::from_value(data.clone())
            .map_err(|e| AppError::ParseError(format!("No se pudo interpretar el perfil: {e}")))?;

        info!(
            platform = %profile.platform,
            username = %profile.username,
            "Tracker profile fetched successfully"
        );

        Ok(profile)
    }
}
