# Investigación de APIs de música (octubre de 2026)

**Objetivo:** reproducir canciones **completas** desde el navegador, sin fines de lucro (proyecto universitario).
**Decisión:** **Spotify** (Web API + Web Playback SDK) como catálogo principal y **archivos locales** como segunda fuente.

---

## 1. Spotify (ELEGIDA)

### Por qué
- Con el **Web Playback SDK**, el navegador se convierte en un dispositivo "Spotify Connect" que reproduce las **canciones completas** del catálogo.
- Es gratis para desarrolladores. El único requisito es que el **dueño de la app tenga Premium**, y el usuario lo tiene.

### Configuración (una sola vez)
1. Entrar a https://developer.spotify.com/dashboard → **Create app**.
2. Redirect URIs: `http://127.0.0.1:5173/` (desarrollo; Spotify **no acepta `localhost`**, pero sí loopback por IP sobre HTTP) y `https://nicoalsd.github.io/music-app/` (producción; fuera de loopback Spotify exige HTTPS).
3. APIs: marcar **Web API** y **Web Playback SDK**.
4. Copiar el **Client ID** en `.env.local` como `VITE_SPOTIFY_CLIENT_ID`. **No** se usa el Client Secret, porque el flujo es PKCE.
5. En **User Management**, agregar los emails de las cuentas que probarán la app (incluido el profesor). El máximo es **5**.

### Límites del modo Development (cambios de febrero de 2026; las apps existentes se migraron el 9 de marzo de 2026)
- El dueño debe tener **Premium** activo; si lo pierde, la app deja de funcionar.
- **1 Client ID por desarrollador** y **5 usuarios como máximo** en la allowlist. Los usuarios autorizados no necesitan Premium para la Web API, **pero el Web Playback SDK sí exige Premium a quien reproduce**.
- `GET /search`: `limit` máximo **10** (por defecto 5). Para más resultados hay que paginar con `offset`.
- **Se eliminaron** los fetch en lote (`GET /tracks?ids=`, `/albums?ids=`, `/artists?ids=`…), new releases, categories y artist top-tracks.
- **Se eliminaron estos campos**: `popularity`, `available_markets`, `external_ids` (track y album), `followers` (artist) y `email`, `country` y `product` (user). **No se puede leer `product` para saber si el usuario es Premium**: hay que detectarlo con el `account_error` del SDK.
- En las playlists, `/playlists/{id}/tracks` pasó a ser `/playlists/{id}/items`, y solo devuelve contenido de las playlists propias o colaborativas. Esta app **no** necesita las playlists de Spotify: la nuestra es la lista doble.

### Autenticación: Authorization Code + PKCE (sin backend)
```
1. code_verifier = random 64 chars (A-Z a-z 0-9 -._~) → sessionStorage
2. code_challenge = base64url(SHA-256(code_verifier))
3. redirect → https://accounts.spotify.com/authorize?
     response_type=code&client_id=…&redirect_uri=…&code_challenge_method=S256
     &code_challenge=…&state=<random>&scope=streaming user-read-email user-read-private
     user-read-playback-state user-modify-playback-state
4. vuelve a la raíz: /?code=…&state=…  → verificar state
5. POST https://accounts.spotify.com/api/token  (x-www-form-urlencoded)
     grant_type=authorization_code&code=…&redirect_uri=…&client_id=…&code_verifier=…
   → { access_token, token_type, expires_in: 3600, refresh_token, scope }
6. Refresh: POST /api/token  grant_type=refresh_token&refresh_token=…&client_id=…
   (puede devolver un refresh_token nuevo: guardarlo si viene)
```
- El access token se guarda en memoria y el refresh token en `localStorage`. Es un riesgo aceptable para un proyecto educativo; está documentado.
- El refresh se hace de forma proactiva 60 s antes de que expire, y reactiva ante un 401, con **un solo** reintento.
- Hay que quitar `?code=` de la URL con `history.replaceState` después del intercambio.

### Web Playback SDK
```html
<script src="https://sdk.scdn.co/spotify-player.js"></script>
```
```ts
window.onSpotifyWebPlaybackSDKReady = () => {
  const player = new Spotify.Player({
    name: 'Reproductor Taller Listas Dobles',
    getOAuthToken: cb => cb(currentAccessToken()),   // se llama cada vez que el SDK lo necesita
    volume: 0.5,
  });
  player.addListener('ready', ({ device_id }) => { /* guardar device_id */ });
  player.addListener('not_ready', ({ device_id }) => { /* el dispositivo se desconectó */ });
  player.addListener('player_state_changed', state => { /* state puede ser null */ });
  player.addListener('initialization_error', ({ message }) => {}); // sin EME/Widevine
  player.addListener('authentication_error', ({ message }) => {}); // token inválido
  player.addListener('account_error', ({ message }) => {});        // no Premium
  player.addListener('playback_error', ({ message }) => {});
  player.connect();
};
```
- Tipos: `@types/spotify-web-playback-sdk`.
- Métodos: `togglePlay`, `pause`, `resume`, `seek(ms)`, `setVolume(0..1)`, `getCurrentState()`, `activateElement()` (se llama en el primer clic por la política de autoplay) y `disconnect()`.
- El script se carga **una sola vez**. En React `StrictMode` el efecto se monta dos veces, así que hace falta un singleton.

### Reproducir una canción en nuestro dispositivo
```
PUT https://api.spotify.com/v1/me/player/play?device_id={device_id}
Authorization: Bearer …
{ "uris": ["spotify:track:…"], "position_ms": 0 }
→ 204
```
- Se envía **una sola URI** por vez, para que la lista doble controle siguiente y anterior y no lo haga la cola de Spotify.
- La primera vez puede hacer falta transferir la reproducción: `PUT /me/player { "device_ids": [id], "play": false }`.
- Un 404 "Device not found" justo después de `ready` es una race condition conocida: se reintenta con backoff (300 ms, 600 ms, 1200 ms).

### Detección de fin de canción (el SDK no tiene evento "ended")
Esta lógica vive en `SpotifyOutput`:
1. Se guarda `playingUri` y `lastPosition` en cada `player_state_changed`.
2. Se considera **terminada** si llega un estado con `paused === true`, `position === 0` y además:
   - `track_window.previous_tracks` contiene `playingUri`, **o**
   - el estado anterior estaba a `duration - position < 1500 ms` y no estaba en pausa.
3. **Respaldo**: mientras suena, cada 1 s se consulta `getCurrentState()`; si `position >= duration - 300` se considera terminada.
4. **Idempotencia**: se emite `ended` **una sola vez** por `playingUri` y reproducción, y se ignoran los duplicados.
5. Una pausa del usuario (`pause()` llamada por nosotros) **no** cuenta como fin: hay un flag `userPaused`.
6. Hay que tener cuidado con los IDs relinkeados: el track del estado puede tener otro id; se compara por `uri` **o** por `linked_from.uri`.

Todo esto se prueba con un SDK simulado y fake timers (ver `testing-plan.md`).

### Búsqueda
```
GET https://api.spotify.com/v1/search?q={query}&type=track&limit=10&offset={n}
→ tracks.items[]: { id, uri, name, duration_ms, explicit, artists[{name}], album{name, images[{url,width,height}]}, external_urls.spotify }
```
- Se mapea a `Song { trackId, source: 'spotify', uri, title, artists: string[], album: { id, name }, durationMs, artwork: { small, medium, large }, explicit, externalUrl }`. `artwork` sale de `album.images`, que vienen ordenadas de mayor a menor (640, 300 y 64 px).

#### Búsqueda por artista y por álbum
```
GET /v1/search?q={query}&type=track,artist,album&limit=10&offset={n}
→ { tracks: {items[]}, artists: {items[]: {id, name, images[], genres[]}}, albums: {items[]: {id, name, artists[], images[], release_date, total_tracks}} }
```
- Filtros de campo dentro de `q` (Spotify los soporta): `artist:`, `album:`, `track:` y `year:`. Por ejemplo, `q=album:currents artist:tame impala`. Los filtros "Artistas" y "Álbumes" de la UI cambian `type`; el campo de texto puede aceptar la sintaxis avanzada.
- **Detalle de artista**: `GET /v1/artists/{id}` + `GET /v1/artists/{id}/albums?include_groups=album,single&limit=10`.
- **Detalle de álbum**: `GET /v1/albums/{id}` (trae `tracks.items`) y, para paginar, `GET /v1/albums/{id}/tracks?limit=50`. Las canciones de un álbum **no traen `album.images`**: se reutilizan las imágenes del álbum padre.
- ⚠️ **No disponibles en modo Development (2026)**: `GET /artists/{id}/top-tracks`, los batch `?ids=`, `popularity` y `followers`. Así que en el detalle de artista se muestran sus álbumes, no sus "canciones populares".
- No confirmé en la documentación que `artists/{id}/albums` y `albums/{id}/tracks` sigan disponibles en modo Development; la guía de migración no los lista como eliminados. Hay que verificarlo al implementar, y si responden 403, el detalle se arma solo con la búsqueda `album:`.

#### Archivos locales: metadatos y carátula
- Con `music-metadata` (`parseBlob(file)`) se leen `common.title`, `common.artists`, `common.album` y `common.picture[0]` (la imagen embebida, que se convierte en `Blob` → `URL.createObjectURL`).
- Si no hay etiquetas, el título es el nombre del archivo, el artista "Artista desconocido" y la carátula la de respaldo del tema.
- La respuesta se valida en tiempo de ejecución, porque es `unknown`; se puede usar `zod` o validadores escritos a mano.

### Errores HTTP
- **401**: refresh del token y un reintento.
- **403**: usuario fuera de la allowlist o sin Premium para reproducir.
- **404**: dispositivo no encontrado (ver arriba).
- **429**: se lee el header `Retry-After` (segundos) y se espera.
- **5xx**: reintento con backoff, como máximo 2 veces.

### Requisitos del navegador
- Necesita **EME + Widevine**: Chrome, Edge o Firefox (con "Reproducir contenido controlado por DRM" activado). En Fedora, el Chromium de los repos suele venir **sin** Widevine, así que conviene usar Google Chrome o Firefox.
- Safari funciona en escritorio, pero en iOS el SDK **no** está soportado.

---

## 2. Archivos locales (ELEGIDA como segunda fuente)
- `<input type="file" accept="audio/*" multiple>` + drag & drop sobre la lista.
- `URL.createObjectURL(file)` → `<audio src>` (`Html5AudioOutput`). Hay que llamar a `revokeObjectURL` al eliminar la canción definitivamente.
- Metadatos: el título sale del nombre del archivo sin extensión. Opcionalmente se pueden leer las etiquetas ID3 con `music-metadata` (versión browser) o `jsmediatags`. La duración se obtiene precargando con `preload="metadata"` y leyendo `loadedmetadata`.
- Hay que validar el tipo con `audio.canPlayType(file.type)`, porque algunos formatos (por ejemplo `.flac` en Safari) no se pueden reproducir, y avisarlo.
- No sobreviven a una recarga de la página (ver la guía, sección 13).

---

## 3. Descartadas

| API | Motivo |
|-----|--------|
| **Tidal** (aunque el usuario tiene suscripción) | La API pública (`openapi.tidal.com/v2`) da metadatos y el audio solo puede pasar por su Player SDK oficial, que para apps de terceros reproduce **solo previews de 30 s**. La reproducción completa depende de un "production mode" que todavía no está abierto. |
| **Apple Music (MusicKit JS)** | Necesita una membresía del Apple Developer Program (99 USD al año) y una suscripción a Apple Music. |
| **Deezer** | La API pública solo entrega previews de 30 s. |
| **YouTube** | El IFrame Player API reproduce videos completos, pero sus términos prohíben extraer solo el audio o esconder el reproductor. |
| **Audius** | Funciona (canciones completas, `api.audius.co/v1`, `app_name` sin key), pero el usuario prefirió Spotify. **Es el plan B si Spotify falla.** |
| **Jamendo / Internet Archive** | Música CC o de dominio público, completa y gratis, pero con un catálogo poco conocido. Es plan C. |

---

## Fuentes
- [Spotify — February 2026 Web API Dev Mode Changes (Migration Guide)](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [TechCrunch — Spotify changes developer mode API to require premium accounts, limits test users (2026-02-06)](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- [Spotify — Web Playback SDK guide](https://developer.spotify.com/documentation/web-playback-sdk/guide)
- [Spotify Community — Web Playback SDK: Detect Track End](https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-Detect-Track-End/m-p/5450835/highlight/true)
- [TIDAL — "TIDAL SDK for Web" (GitHub Discussion #40)](https://github.com/orgs/tidal-music/discussions/40)
- [TIDAL iOS Player README](https://github.com/tidal-music/tidal-sdk-ios/blob/main/Sources/Player/README.md)
- [Audius Developer Docs](https://docs.audius.co/)
- [Jamendo API v3.0](https://developer.jamendo.com/v3.0/tracks/file)
