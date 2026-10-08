# Arquitectura

## Capas

```mermaid
flowchart TD
  UI["ui/ — Componentes React<br/>(solo presentación)"]
  NP["ui/ — NowPlayingView + LyricsPanel<br/>(solo presentación)"]
  ST["state/ — PlayerStore<br/>(observable + useSyncExternalStore)"]
  LH["state/ — useLyrics<br/>(AbortController, último gana)"]
  PL["player/ — PlayerEngine"]
  AO{{"AudioOutput (interfaz)"}}
  SO["SpotifyOutput<br/>Web Playback SDK"]
  HO["Html5AudioOutput<br/>&lt;audio&gt;"]
  CORE["core/ — DoublyLinkedList&lt;Song&gt;, Playlist, Song, Node"]
  LYR["core/ — Lyrics<br/>parseLrc · activeLineIndex"]
  PR{{"MusicProvider (interfaz)"}}
  SP["SpotifyProvider"]
  LF["LocalFileProvider"]
  LP{{"LyricsProvider (interfaz)"}}
  LR["LrcLibLyricsProvider<br/>(fetch inyectado, caché en memoria)"]
  AU["auth/ — SpotifyAuth (PKCE)"]

  UI --> NP
  UI -->|acciones / snapshots| ST
  NP -->|letra de la canción actual| LH
  ST --> PL
  ST --> CORE
  ST --> PR
  PL --> CORE
  PL --> AO
  AO --> SO
  AO --> HO
  LH --> LP
  LH --> LYR
  PR --> SP
  PR --> LF
  LR -->|implementa| LP
  LR --> LYR
  SP --> AU
  SO --> AU
```

**Regla:** las flechas solo apuntan hacia abajo. `core/` no importa nada.

## Clases principales

```mermaid
classDiagram
  class Node~T~ {
    +value: T
    +prev: Node~T~ | null
    +next: Node~T~ | null
  }
  class DoublyLinkedList~T~ {
    -head: Node~T~ | null
    -tail: Node~T~ | null
    -length: number
    +size: number
    +insertFirst(v) Node~T~
    +insertLast(v) Node~T~
    +insertAt(i, v) Node~T~
    +removeAt(i) T
    +removeNode(n) T
    +move(from, to) void
    +nodeAt(i) Node~T~
    +indexOf(n) number
    +find(pred) Node~T~ | null
    +toArray() T[]
  }
  class Song {
    +entryId: string
    +trackId: string
    +source: 'spotify' | 'local'
    +title, artist, album
    +durationMs: number
    +artworkUrl?: string
    +uri: string
  }
  class Playlist {
    -list: DoublyLinkedList~Song~
    -current: Node~Song~ | null
    +addFirst(s) / addLast(s) / addAt(i, s) / addNext(s)
    +remove(entryId) RemoveResult
    +next(repeat) Song | null
    +previous(repeat) Song | null
    +select(entryId)
    +version: number
  }
  class AudioOutput {
    <<interface>>
    +load(song) Promise
    +play() Promise
    +pause()
    +seek(ms)
    +setVolume(0..1)
    +on(event, cb)
    +dispose()
  }
  class PlayerEngine {
    -outputs: Record~source, AudioOutput~
    -active: AudioOutput | null
    +repeat: off|all|one
    +shuffle: boolean
    +play() / pause() / next() / previous() / seek()
    -onTrackEnded()
  }
  class MusicProvider {
    <<interface>>
    +search(q, page, signal) Promise~Song[]~
  }
  DoublyLinkedList *-- Node
  Playlist *-- DoublyLinkedList
  PlayerEngine --> Playlist
  PlayerEngine --> AudioOutput
  AudioOutput <|.. SpotifyOutput
  AudioOutput <|.. Html5AudioOutput
  MusicProvider <|.. SpotifyProvider
  MusicProvider <|.. LocalFileProvider
```

## Secuencia: el usuario pulsa "Siguiente"

```mermaid
sequenceDiagram
  actor U as Usuario
  participant UI as PlayerBar
  participant S as PlayerStore
  participant E as PlayerEngine
  participant P as Playlist
  participant O as SpotifyOutput
  U->>UI: clic ⏭
  UI->>S: next()
  S->>E: next()
  E->>P: next(repeat)
  P-->>E: Song (current = current.next)
  E->>E: ¿cambia el output? pausar el anterior
  E->>O: load(song) + play()
  O->>O: PUT /me/player/play {uris:[uri]}
  E-->>S: emit("trackChanged")
  S-->>UI: snapshot nuevo → re-render
```

## Secuencia: termina una canción de Spotify

```mermaid
sequenceDiagram
  participant SDK as Spotify SDK
  participant O as SpotifyOutput
  participant E as PlayerEngine
  SDK->>O: player_state_changed(paused, position 0, previous_tracks ∋ uri)
  O->>O: ¿ya se emitió ended para esta reproducción? no → marcar
  O-->>E: emit("ended")
  E->>E: aplicar repeat/shuffle → next o replay
```

## Favoritos

- **Fuente de verdad única**: Favoritos es una `Playlist` más dentro de la `DoublyLinkedList<Playlist>` de `PlaylistLibrary`, con `kind: 'favorites'`. Una canción es favorita **si y solo si** alguna entrada de esa playlist tiene su `trackId`; no hay un conjunto paralelo que se pueda desincronizar.
- `PlaylistLibrary.like(track, name)` crea Favoritos con el primer corazón (insertada al inicio de la lista de playlists) y agrega la canción al final; `unlike(trackId)` quita todas sus entradas. Favoritos no se puede renombrar ni eliminar, y solo puede haber una.
- `PlayerStore.toggleFavorite(track)` / `toggleFavoriteEntry(entryId)` nunca cambian la playlist activa ni cortan la reproducción; si Favoritos es la activa, avisan al `PlayerEngine` como cualquier otra mutación. El snapshot expone `favoriteTrackIds` (misma referencia mientras no cambie) y `PlaylistSummary.kind`.
- Persistencia: cada playlist guarda su `kind`; los datos anteriores, sin `kind`, se leen como playlists normales.
- UI: `FavoriteButton` (barra, Reproduciendo ahora, filas) y los menús; la etiqueta dice lo que hará el botón ("Agregar … a Favoritos" / "Quitar … de Favoritos") y el estado cambia también la forma (corazón relleno).

## Letras (LRCLIB)

Spotify Web API no tiene un endpoint público de letras, así que las letras vienen de [LRCLIB](https://lrclib.net), que es gratuito, no pide API key y responde con `Access-Control-Allow-Origin: *`. Las piezas se reparten así:

- **`core/Lyrics.ts`** (dominio puro, sin fetch ni React): `parseLrc(lrc)` convierte el texto LRC en `LyricLine[]`, y `activeLineIndex(lines, positionMs)` busca la línea activa con búsqueda binaria.
- **`providers/LyricsProvider.ts`**: la interfaz `LyricsProvider` (Strategy), con `find(query, signal?)`, que resuelve `null` cuando no hay letra, y el error `LyricsRequestError` (con `status`) para los fallos.
- **`providers/LrcLibLyricsProvider.ts`**: implementa la interfaz. Recibe `fetch` por constructor, tiene caché en memoria y valida la respuesta de LRCLIB antes de usarla.
- **`state/useLyrics.ts`**: el hook que pide la letra de la canción actual. Cancela la petición anterior con `AbortController`, así que solo gana la última canción.
- **`ui/` (`NowPlayingView`, `LyricsPanel`)**: solo pinta los estados y llama a `onSeek`. No conoce LRCLIB.

```ts
// core/Lyrics.ts
interface LyricLine { readonly timeMs: number; readonly text: string }
type Lyrics =
  | { kind: 'synced'; lines: readonly LyricLine[] }
  | { kind: 'plain'; lines: readonly string[] }
  | { kind: 'instrumental' };
```

```mermaid
classDiagram
  class LyricLine {
    +timeMs: number
    +text: string
  }
  class LyricsProvider {
    <<interface>>
    +find(query, signal?) Promise~Lyrics | null~
  }
  class LyricsRequestError {
    +status: number
  }
  class LrcLibLyricsProvider {
    -fetch: FetchLike
    -cache: Map~string, Lyrics | null~
    +find(query, signal?) Promise~Lyrics | null~
  }
  LyricsProvider <|.. LrcLibLyricsProvider
  LrcLibLyricsProvider ..> LyricLine
  LrcLibLyricsProvider ..> LyricsRequestError
```

## Secuencia: cambia la canción actual (letra)

```mermaid
sequenceDiagram
  participant S as PlayerStore
  participant H as useLyrics
  participant P as LrcLibLyricsProvider
  participant L as LRCLIB
  participant V as NowPlayingView
  S-->>H: la canción actual cambió
  H->>H: abort() de la petición anterior
  alt no hay canción
    H-->>V: idle
  else caché con la misma clave
    P-->>H: Lyrics (sin red)
  else
    H->>P: find(query, signal)
    P->>L: GET /api/get (título, artista, álbum, duración)
    alt 404
      P->>L: GET /api/search (título, artista)
      P->>P: elegir la duración más cercana (<= 3 s)
    end
    L-->>P: JSON (syncedLyrics, plainLyrics o instrumental)
    P->>P: parseLrc sobre syncedLyrics
    P-->>H: Lyrics o null
  end
  H-->>V: LyricsStatus (loading, ready, empty o error)
  V->>V: subscribeProgress, activeLineIndex(lines, positionMs)
  V-->>V: solo cambia el atributo aria-current de la línea activa
```

Reglas de esta secuencia:
- Un `AbortError` **no** es un error para la UI. El hook lo ignora y tampoco se guarda en caché.
- Se guardan en caché los resultados `synced`, `plain`, `instrumental` y `null` (no encontrado), con clave normalizada (título, artista y duración redondeada). Los errores de red o de HTTP **no** se guardan.
- `activeLineIndex` se calcula en cada tick del progreso, con la misma suscripción `subscribeProgress` que la barra. La lista de la letra no se vuelve a renderizar: solo cambia la línea marcada.
- Las pruebas usan `fetch` simulado. Ningún test de `providers/` hace red real.

## Estado expuesto a React (snapshot inmutable)

```ts
interface PlayerSnapshot {
  songs: readonly Song[];          // toArray() memoizado por playlist.version
  currentEntryId: string | null;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  positionMs: number;              // solo lo consume <ProgressBar/>
  durationMs: number;
  volume: number; muted: boolean;
  repeat: 'off' | 'all' | 'one'; shuffle: boolean;
  spotify: 'disconnected' | 'connecting' | 'ready' | 'no-premium' | 'unsupported' | 'error';
  error: string | null;
}
```
- `getSnapshot()` debe devolver **la misma referencia** si nada cambió, porque si no `useSyncExternalStore` entra en un bucle.
- El progreso tiene una suscripción aparte (`subscribeProgress`), para no re-renderizar toda la lista cuatro veces por segundo.
