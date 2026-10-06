# Plan de pruebas

Objetivo: **cero bugs**. La lógica crítica (lista doble, playlist y engine) está aislada del navegador para poder probarla al 100 %.

## Pirámide

| Nivel | Herramienta | Qué cubre | Cobertura mínima |
|-------|-------------|-----------|------------------|
| Unitario | Vitest | `core/`, `player/`, `auth/`, `providers/`, `state/` | 95 % de líneas y ramas en core y player |
| Propiedades | Vitest + fast-check | Invariantes de `DoublyLinkedList` y `Playlist` | 1000 corridas por propiedad |
| Componentes | Vitest + Testing Library + jsdom | `ui/` | 80 % |
| E2E | Playwright (Chromium) | Flujos completos con archivos locales | los flujos de la sección E2E |
| Manual | Checklist | Spotify real, DRM, móvil | antes de entregar |

Umbrales en `vitest.config.ts`:
```ts
coverage: { provider: 'v8', thresholds: {
  'src/core/**': { lines: 95, branches: 95, functions: 95 },
  'src/player/**': { lines: 95, branches: 95, functions: 95 },
  lines: 80, branches: 80 } }
```

## Helper obligatorio: `assertInvariants(list)`
En `src/core/__tests__/invariants.ts` va un helper que verifica las 6 invariantes de `AGENTS.md`, y **se llama después de cada operación** en todos los tests de la lista. Necesita acceso de solo lectura a `head` y `tail` (getters `headNode` y `tailNode`, o un método `debugNodes()`).

## Matriz: `DoublyLinkedList`

| Operación | Casos |
|-----------|-------|
| `insertFirst` | lista vacía · 1 elemento · n elementos |
| `insertLast` | lista vacía · 1 elemento · n elementos |
| `insertAt` | i = 0 · i = size · el medio · i = size/2 ± 1 (cruza el punto desde el que se recorre) · i = −1 → error · i = size+1 → error · i no entero → error |
| `removeAt` | única · head · tail · el medio · lista vacía → error · fuera de rango → error |
| `removeNode` / `removeById` | nodo de otra lista → error · id inexistente → `SongNotFoundError` |
| `move` | from < to · from > to · from == to (no-op) · a 0 · a size−1 · fuera de rango → error · se conserva la identidad del nodo |
| `nodeAt` | se recorre desde head cuando i < size/2 y desde tail en caso contrario (se verifica el resultado, no el camino) |
| iterador / `toArray` | vacía · orden correcto · no expone los nodos |

**Propiedad (fast-check):** se genera una secuencia aleatoria de `{insertFirst|insertLast|insertAt(i)|removeAt(i)|move(a,b)}` y se aplica a la lista y a un array de referencia. Después de cada paso se comprueba que `list.toArray()` sea igual al array y que `assertInvariants` pase.

## Matriz: `Playlist`

| Caso | Esperado |
|------|----------|
| addFirst/addLast/addAt en una lista vacía | current = la canción nueva (si no había) |
| addAt antes de current | current no cambia y su índice +1 |
| addNext | se inserta justo después de current; si no hay current, al inicio |
| remove(current) en el medio | current = next |
| remove(current) en la cola | current = prev |
| remove(current) cuando es la única | current = null, lista vacía |
| remove(otra) | current no cambia |
| next en la cola, repeat off | null (fin) |
| next en la cola, repeat all | head |
| previous en head, repeat off | head (reinicio) |
| previous en head, repeat all | tail |
| select(entryId inexistente) | `SongNotFoundError` |
| duplicados | 2 entradas con el mismo trackId y entryIds distintos; eliminar una no afecta a la otra |
| version | se incrementa en cada mutación y no en las lecturas |

## Matriz: `PlayerEngine` (con `FakeAudioOutput` y `FakeClock`)

| Caso | Esperado |
|------|----------|
| play con la lista vacía | no hace nada; status idle |
| play sin current | empieza en head |
| previous con posición > 3000 ms | seek(0), misma canción |
| previous con posición ≤ 3000 ms | canción anterior |
| ended, repeat one | la misma canción desde 0 |
| ended, repeat all, en la cola | head |
| ended, repeat off, en la cola | status paused, posición 0 |
| next con repeat one | sí pasa a la siguiente |
| cambio spotify → local | `spotifyOutput.pause()` se llama antes que `html5.play()` |
| play() rechaza (NotAllowedError) | status vuelve a paused y error visible |
| error de carga | salta a la siguiente; si todas fallan, se detiene (sin bucle) |
| next×3 rápido | queda en la canción +3 y solo la última carga se reproduce (las promesas viejas se ignoran) |
| eliminar la canción que suena | el output carga la nueva actual, o se libera si la lista queda vacía |
| shuffle on con un Random fijo | orden determinista y la canción actual primero |
| shuffle off | vuelve al orden de la lista original |
| shuffle + insertar/eliminar | sin referencias colgantes y todas las canciones exactamente una vez |
| volumen / mute / unmute | se restaura el volumen anterior |
| seek fuera de rango | se limita a [0, duration] |

## Matriz: `SpotifyOutput` (SDK simulado con un emisor de eventos y fake timers)

| Caso | Esperado |
|------|----------|
| state paused + position 0 + previous_tracks ∋ uri | emite `ended` una vez |
| el mismo estado repetido 3 veces | `ended` se emite **una sola vez** |
| pausa del usuario | **no** emite `ended` |
| polling: posición ≥ duración − 300 | emite `ended` |
| track relinkeado (linked_from.uri) | se reconoce como la misma canción |
| `ready` → device_id guardado; play antes de ready | espera a ready (o hay timeout con un error claro) |
| 404 device not found | reintento con backoff 3 veces y después error |
| `account_error` | status `no-premium` |
| `initialization_error` | status `unsupported` |
| `authentication_error` | pide refresh; si falla → `disconnected` |
| dispose | `disconnect()`, limpia los listeners y los timers |
| StrictMode (doble init) | un solo `Spotify.Player` creado |

## Matriz: `SpotifyAuth` (fetch simulado, `crypto.subtle` real en jsdom/node)

- `code_challenge` = base64url(SHA-256(verifier)), comprobado con un vector conocido de la RFC 7636: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`.
- Si `state` no coincide → `AuthError` y no se intercambia el code.
- El token se renueva 60 s antes de expirar (fake timers).
- 401 → refresh → reintento una vez; un segundo 401 → logout.
- Si el refresh devuelve un refresh_token nuevo, se reemplaza el guardado.
- `localStorage` lanza una excepción (modo privado) → la app sigue funcionando, solo sin persistencia.

## Matriz: `SpotifyProvider`

- El mapeo de la respuesta a `Song` es correcto (artistas unidos con ", " y la carátula más cercana a 300 px).
- Una respuesta malformada → error tipado, sin crash.
- `limit` nunca es mayor que 10; "cargar más" incrementa `offset` en 10.
- Abort de la búsqueda anterior → no actualiza los resultados.
- 429 respeta `Retry-After`.

## Matriz: `LocalFileProvider` / `Html5AudioOutput`

- Archivo no soportado (`canPlayType === ''`) → se rechaza con un mensaje.
- Título = nombre del archivo sin extensión.
- Al eliminar definitivamente → `URL.revokeObjectURL` se llama una vez.
- `ended` del `<audio>` → `ended` del output.

## Componentes (Testing Library, consultas por rol)

- PlayerBar: los botones tienen aria-labels en español y el play cambia a "Pausar".
- Barra de progreso: mientras se arrastra no se actualiza desde el engine; el seek se aplica al soltar.
- Diálogo "Insertar en posición": validación de 1 a size+1 y botón deshabilitado si es inválida.
- Atajos: Espacio alterna play; escribir un espacio en la búsqueda **no** alterna.
- Toast "Deshacer": restaura la canción en su posición.
- Estados vacío, cargando y error que se ven en la lista y en la búsqueda.
- La fila actual tiene `aria-current="true"`.

## E2E (Playwright, con `e2e/fixtures/tone-a.wav`, `tone-b.wav` y `tone-c.wav`, que son tonos cortos de 2 a 3 s)

1. Importar 3 archivos → aparecen en orden → play → suena el primero.
2. Siguiente / anterior recorren a, b y c.
3. Insertar al inicio, al final y en la posición 2 → el orden visible es correcto.
4. Eliminar la canción actual mientras suena → suena la siguiente.
5. Avance automático: dejar que termine `a` → suena `b`.
6. Repeat all en la última → vuelve a la primera.
7. Deshacer una eliminación.
8. Teclado: todo el flujo 1 a 4 sin ratón.
9. Recargar → se mantienen el volumen y el modo; los locales se marcan "vuelve a importar".
10. Accesibilidad: `@axe-core/playwright` sin violaciones serias en la vista principal.

Spotify **no** se prueba en E2E automático (necesitaría credenciales y DRM); se cubre con los unitarios simulados y la checklist manual.

## Checklist manual antes de entregar

- [ ] Login con Spotify en Chrome o Firefox (DRM activado) en `http://127.0.0.1:5173`.
- [ ] Buscar, agregar al inicio, al final y en una posición, y reproducir una canción **completa** hasta el final y que avance sola.
- [ ] Mezclar una canción de Spotify y un archivo local: nunca suenan dos a la vez.
- [ ] Dejar la app abierta más de 60 min: el token se renueva sin cortes.
- [ ] Abrir Spotify en el móvil y transferir: la app muestra "Reproduciendo en otro dispositivo".
- [ ] Una cuenta sin Premium (o fuera de la allowlist) ve un mensaje claro.
- [ ] Responsive a 360 px.
- [ ] Contraste y foco visibles en modo claro.
- [ ] `pnpm typecheck && pnpm lint && pnpm test:coverage && pnpm e2e` en verde.
