# Arquitectura

## Capas

```mermaid
flowchart TD
  UI["ui/ — Componentes React<br/>(solo presentación)"]
  ST["state/ — PlayerStore<br/>(observable + useSyncExternalStore)"]
  PL["player/ — PlayerEngine"]
  AO{{"AudioOutput (interfaz)"}}
  SO["SpotifyOutput<br/>Web Playback SDK"]
  HO["Html5AudioOutput<br/>&lt;audio&gt;"]
  CORE["core/ — DoublyLinkedList&lt;Song&gt;, Playlist, Song, Node"]
  PR{{"MusicProvider (interfaz)"}}
  SP["SpotifyProvider"]
  LF["LocalFileProvider"]
  AU["auth/ — SpotifyAuth (PKCE)"]

  UI -->|acciones / snapshots| ST
  ST --> PL
  ST --> CORE
  ST --> PR
  PL --> CORE
  PL --> AO
  AO --> SO
  AO --> HO
  PR --> SP
  PR --> LF
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
