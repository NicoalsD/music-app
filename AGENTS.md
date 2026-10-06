# AGENTS.md — Reproductor de Música con Listas Dobles

Reglas para cualquier agente de IA (Claude Code, Codex, Cursor, etc.) que trabaje en este repositorio.
Son obligatorias. Antes de tocar el reproductor, los proveedores o los tests, lee los documentos de [`.agents/`](#documentación-de-apoyo-agents).

## 0. ⚠️ Regla de idioma (OBLIGATORIA, la más importante)

| Qué | Idioma | Ejemplos |
|-----|--------|----------|
| **Todo el código** | **Inglés** | Clases (`DoublyLinkedList`, `PlayerEngine`), métodos (`insertAt`, `removeById`), variables, tipos, interfaces, enums, constantes, nombres de archivos y carpetas, rutas y endpoints (`/me/player/play`), claves de `localStorage` (`music-app:v1`), eventos (`trackEnded`), IDs y `data-testid` |
| **Comentarios en el código** y JSDoc | **Inglés** | `// Reassign current before unlinking the node` |
| **Nombres de los tests** (`describe` / `it`) | **Inglés** | `it('keeps current when inserting before it')` |
| **Mensajes de commit** y nombres de ramas | **Inglés** | `feat: add insertAt to DoublyLinkedList` |
| **Documentación** (`AGENTS.md`, `CLAUDE.md`, `.agents/*`, `README.md`) | **Español** | Esta guía |
| **Textos visibles para el usuario** en la UI | **Español** | "Agregar al inicio", aria-labels como "Reproducir" |

- Los textos de la UI **nunca** se escriben directamente en los componentes: se centralizan en `src/ui/i18n/es.ts` con **claves en inglés**, por ejemplo `strings.player.play = 'Reproducir'`.
- Están prohibidos los nombres en español o mezclados en el código (`agregarCancion`, `listaDoble`, `cancionActual`, `siguienteNodo`).
- Los mensajes de los errores de dominio (`IndexOutOfRangeError`) van en inglés, para desarrolladores; la UI los traduce a un mensaje en español para el usuario.

## 1. Contexto del proyecto

Es el taller de la asignatura **Estructura de Datos**: "Taller Listas Dobles — Reproductor de Música".
Hay que construir una app en **TypeScript** que simule una lista de reproducción usando una **lista doblemente enlazada implementada a mano**, con un frontend donde el usuario interactúe.

### Requisitos del taller (no negociables)
| # | Requisito | Dónde vive |
|---|-----------|------------|
| R1 | Frontend con el que el usuario interactúa | `src/ui/` |
| R2 | Agregar canción **al inicio** | `DoublyLinkedList.insertFirst` → `Playlist.addFirst` |
| R3 | Agregar canción **al final** | `DoublyLinkedList.insertLast` → `Playlist.addLast` |
| R4 | Agregar canción **en cualquier posición** | `DoublyLinkedList.insertAt` → `Playlist.addAt` |
| R5 | **Eliminar** una canción | `DoublyLinkedList.removeById` / `removeAt` → `Playlist.remove` |
| R6 | **Adelantar** canción (siguiente) | `Playlist.next` (`current = current.next`) |
| R7 | **Retroceder** canción (anterior) | `Playlist.previous` (`current = current.prev`) |
| R8 | Otras funcionalidades pertinentes | Ver la sección 7 |
| R9 | **Crear playlists** (varias: crear, renombrar, eliminar, cambiar de playlist activa) | `PlaylistLibrary` (una `DoublyLinkedList<Playlist>`) |

### Restricciones del usuario
- El diseño es **primero en modo claro**. El modo claro es el que se usa por defecto, y el modo oscuro es opcional y va después.
- Lo prioritario es la **experiencia de usuario**: un flujo intuitivo y sin pasos innecesarios.
- Las canciones se **reproducen completas** (no se aceptan previews de 30 s).
- Se debe usar **POO**.
- **Cero bugs**: todo cambio va con tests (ver la sección 8 y `.agents/testing-plan.md`).
- **Metadatos obligatorios**: toda canción muestra **título, artista(s), álbum y carátula**. En Spotify, la carátula sale de `album.images`. En los archivos locales se leen las etiquetas ID3 (artista, álbum e imagen embebida); si no tienen imagen, se muestra una carátula de respaldo generada con el tema (sello *hanko* con la inicial), nunca un hueco vacío.
- **Búsqueda completa**: se puede buscar por **canción, artista y álbum**, y entrar al detalle de un artista o un álbum para agregar sus canciones (ver la sección 7).
- **Estética "Japón antiguo"** (grabado *ukiyo-e* y *shin-hanga*, papel *washi*, etiquetas *Shōwa*), siempre en modo claro. Es obligatorio seguir `.agents/design-theme.md`.

## 2. Stack

- **React 18+** con **Vite** y **TypeScript** en modo `strict` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Tests**: Vitest + @testing-library/react + @testing-library/user-event + jsdom; `fast-check` para tests de propiedades; **Playwright** para E2E.
- **Calidad**: ESLint (typescript-eslint, configuración estricta) + Prettier.
- **Gestor de paquetes**: **pnpm** (no mezclar con npm ni yarn).
- **UI** (todas gratuitas y con licencia MIT; los motivos están en `.agents/design-theme.md`):
  - **Primitivas accesibles sin estilo**: Radix UI (`@radix-ui/react-*`) para Dialog, DropdownMenu, Tabs, Slider, Tooltip y ScrollArea. Así el tema japonés se aplica al 100 %, sin pelear con estilos ajenos. **No** usar librerías ya estilizadas (MUI, Chakra, HeroUI).
  - **Animaciones**: `motion` (Motion for React, `import { motion } from 'motion/react'`), con `whileInView` y `useScroll` para las animaciones de scroll sutiles y `layout` y `AnimatePresence` para insertar y eliminar.
  - **Arrastrar y reordenar**: `@dnd-kit/core` + `@dnd-kit/sortable`.
  - **Avisos**: `sonner`.
  - **Iconos**: `lucide-react` (trazo fino, coherente con el grabado).
  - **Estilos**: CSS Modules + tokens en variables CSS (sin Tailwind), para tener control total del tema.
- **Fuentes de música**: **Spotify** (Web API + Web Playback SDK, el dueño de la app es Premium) y **archivos locales** del usuario. Tidal y Audius se descartaron; los motivos están en `.agents/music-api-research.md`.

## 3. Comandos

```bash
pnpm install                 # instalar dependencias
pnpm dev                     # servidor de desarrollo en http://127.0.0.1:5173 (NO localhost: lo exige Spotify)
pnpm build                   # typecheck + build de producción
pnpm preview                 # servir el build
pnpm typecheck               # tsc --noEmit
pnpm lint                    # eslint .
pnpm format                  # prettier --write .
pnpm test                    # vitest run (unitarios + componentes)
pnpm test:watch              # vitest en modo watch
pnpm test:coverage           # cobertura (umbrales en vitest.config.ts)
pnpm e2e                     # playwright test

# Un solo archivo o un solo test
pnpm vitest run src/core/DoublyLinkedList.test.ts
pnpm vitest run src/core/DoublyLinkedList.test.ts -t "insertAt"
pnpm playwright test e2e/playlist.spec.ts
```

Un cambio solo se considera **terminado** cuando pasan `pnpm typecheck && pnpm lint && pnpm test`.

## 4. Arquitectura

Es una arquitectura por capas en la que **las dependencias apuntan hacia adentro**: `ui → state → player/providers → core`. `core/` no importa nada de las otras capas.

```
src/
├── core/        # Dominio puro, sin React, DOM ni fetch
│   ├── Node.ts
│   ├── DoublyLinkedList.ts
│   ├── Song.ts
│   ├── Playlist.ts
│   ├── PlaylistLibrary.ts
│   └── errors.ts
├── player/      # Reproducción
│   ├── AudioOutput.ts        # interfaz
│   ├── PlayerEngine.ts
│   ├── SpotifyOutput.ts      # Web Playback SDK
│   └── Html5AudioOutput.ts   # <audio> para archivos locales
├── auth/
│   └── SpotifyAuth.ts        # OAuth Authorization Code + PKCE
├── providers/   # De dónde salen las canciones
│   ├── MusicProvider.ts      # interfaz
│   ├── SpotifyProvider.ts
│   └── LocalFileProvider.ts
├── state/       # Puente React ↔ POO
│   ├── PlayerStore.ts        # observable (subscribe/getSnapshot)
│   └── usePlayer.ts          # useSyncExternalStore
└── ui/          # Componentes React (solo presentación)
    └── i18n/es.ts            # textos de la UI en español (claves en inglés)
e2e/             # Tests Playwright
```

Hay más detalle (diagramas de clases y de secuencia) en `.agents/architecture.md`.

### Responsabilidades clave
- **`DoublyLinkedList<T>`**: genérica y **escrita a mano**, con `head`, `tail` y `size`. Por dentro **no puede usar `Array`** (ni `splice`, `push` o `indexOf` sobre arrays) para guardar nodos. `toArray()` y el iterador existen solo para que la UI los consuma.
  - API: `insertFirst`, `insertLast`, `insertAt(index)`, `removeFirst`, `removeLast`, `removeAt(index)`, `removeById(id)`, `move(from, to)`, `find`, `nodeAt`, `isEmpty`, `size`, `[Symbol.iterator]`, `toArray`.
  - `nodeAt(i)` recorre desde `head` si `i < size/2` y desde `tail` en caso contrario.
- **`Playlist`**: contiene una `DoublyLinkedList<Song>` y el puntero **`current: Node<Song> | null`**. Siguiente y anterior se mueven por `next` y `prev` en O(1).
- **`PlaylistLibrary`**: es la colección de playlists del usuario, guardada también como una **`DoublyLinkedList<Playlist>`**. Permite `create(name)`, `rename(id, name)`, `remove(id)` (no se puede eliminar la única playlist), `get(id)`, `setActive(id)` y `move`. Cada `Playlist` tiene `id`, `name`, `createdAt` y su propia lista doble de canciones con su `current`. **Solo la playlist activa se reproduce**; al cambiar de playlist se detiene la reproducción de la anterior. Al iniciar por primera vez se crea "Mi lista".
- **`PlayerEngine`**: play, pausa, seek, volumen, repeat (`off | all | one`), shuffle y la regla de 3 s. Solo depende de la interfaz `AudioOutput` y elige `SpotifyOutput` o `Html5AudioOutput` según `song.source`. Al cambiar de output, **pausa el anterior**.
- **`PlayerStore`**: es el único punto por el que la UI modifica el estado. Expone acciones (`addFirst`, `addAt`, `remove`, `next`, `togglePlay`…) y snapshots inmutables.
- **UI**: no contiene lógica de negocio. Nunca accede a los nodos (`Node`) ni muta la lista directamente.

## 5. Reglas de POO y de código

- Usar clases con **encapsulamiento real**: campos `#privados` o `private`, y getters de solo lectura.
- **Depender de interfaces** (`AudioOutput`, `MusicProvider`, `TokenStore`, `Clock`) e **inyectarlas por constructor**. Así cualquier dependencia del navegador o de la red se puede reemplazar en los tests.
- Cada clase tiene una sola responsabilidad (**SRP**), y se usan los patrones **Strategy** (outputs y providers) y **Observer** (store y eventos del engine).
- Prohibido usar `any`, `@ts-ignore` y `!` (non-null assertion) sin un comentario que lo justifique. Usar `unknown` y validar las respuestas de la API.
- Los errores son **de dominio y tipados**, en `core/errors.ts`: `IndexOutOfRangeError`, `SongNotFoundError`, `EmptyPlaylistError`, `PlaybackError`, `AuthError`. No se lanzan `string`s.
- Las funciones de `core/` son deterministas: nada de `Date.now()` ni `Math.random()` directos (se inyecta `Clock` o `Random`, que shuffle necesita para poder probarse).
- Idioma: el código va en **inglés** y la documentación y la UI en **español** (ver la sección 0, que es obligatoria).
- Los commits siguen las reglas de la sección 11 (obligatorias).

## 6. Invariantes de la lista doble (se verifican en los tests después de cada operación)

1. `size === 0` ⇔ `head === null` ⇔ `tail === null`.
2. `head.prev === null` y `tail.next === null`.
3. Para todo nodo `n`: si `n.next` existe, entonces `n.next.prev === n`; si `n.prev` existe, entonces `n.prev.next === n`.
4. Recorrer de `head` a `tail` da exactamente `size` nodos, y el recorrido de `tail` a `head` es exactamente el inverso.
5. No hay ciclos.
6. Los índices válidos son: `insertAt` acepta `0..size`; `removeAt` y `nodeAt` aceptan `0..size-1`; cualquier otro lanza `IndexOutOfRangeError`.

### Casos borde de `Playlist` / `PlayerEngine` que hay que manejar y probar
- Eliminar la canción **actual**: `current` pasa a `next`; si era la cola, a `prev`; si la lista queda vacía, la reproducción se detiene, `current` queda en `null` y el output se libera.
- Eliminar la **única** canción, o eliminar en una lista vacía.
- Insertar en `0` y en `size`. Insertar en una lista vacía convierte esa canción en `head`, `tail` y, si no hay `current`, también en `current`.
- `next` en la cola: con repeat `all` va a `head`; con `off` se detiene. `previous` en la cabeza: con `all` va a `tail`; con `off` reinicia la canción.
- **Regla de 3 s**: si `position > 3 s`, `previous` reinicia la canción actual en vez de retroceder.
- Repeat `one` solo afecta al fin automático de la canción; los botones siguiente y anterior sí cambian de canción.
- Shuffle no reordena la lista doble: genera un orden aparte (Fisher-Yates con `Random` inyectado), y al desactivarlo se vuelve al orden original desde la canción actual.
- La misma canción se puede agregar dos veces: cada **entrada** de la lista tiene su propio `entryId` (UUID), distinto del `trackId`.
- Las acciones rápidas repetidas (doble clic en siguiente) no pueden dejar el estado incoherente; se usa un token de "última petición gana".

## 7. Funcionalidades extra (R8), en orden de prioridad

1. Barra de reproducción fija: play/pausa, siguiente, anterior, barra de progreso con seek y tiempo transcurrido/total.
2. Búsqueda en Spotify con debounce (300 ms) y cancelación (`AbortController`):
   - **Filtros**: "Todo", "Canciones", "Artistas" y "Álbumes" (`type=track,artist,album`). En "Todo" se muestran el mejor resultado, las canciones, los artistas y los álbumes.
   - **Detalle de artista** (sus álbumes) y **detalle de álbum** (sus canciones), con "Agregar álbum completo" al inicio o al final, que inserta las canciones en orden.
   - **Acciones de cada canción**: "Reproducir ahora", "Reproducir a continuación", "Agregar al inicio", "Agregar al final" e "Insertar en posición…".
   - En cada resultado se ven siempre la carátula, el título, el artista y el álbum.
3. Importar archivos locales (botón + drag & drop).
4. Volumen y mute.
5. Repeat (off/all/one) y shuffle.
6. Reordenar canciones arrastrándolas (usa `move`) y menú contextual por canción.
7. "Deshacer" al eliminar (toast de 5 s).
8. Atajos de teclado (Espacio, ←/→ para seek, Shift+←/→ para anterior/siguiente, M para mute) que no se activan mientras se escribe en un input.
9. Media Session API (controles del SO y teclas multimedia).
10. Persistir la playlist, el volumen y el modo en `localStorage` (excepto los archivos locales, cuyos blob URLs no sobreviven a una recarga; avisarlo en la UI).
11. Duración total de la lista y contador de canciones.

## 8. Testing (prioridad máxima: cero bugs)

- **TDD** en `core/` y `player/`: primero el test y luego el código.
- **Cobertura mínima**: 95 % de líneas y ramas en `src/core` y `src/player`, y 80 % global. Se configura como umbral en `vitest.config.ts` para que falle si no se cumple.
- **Tests de propiedades** (`fast-check`): secuencias aleatorias de insertar y eliminar, comprobando las invariantes de la sección 6 contra un modelo de referencia (un array simple, que solo se usa en el test).
- `SpotifyOutput`, `SpotifyAuth` y `SpotifyProvider` se prueban con **SDK y `fetch` simulados**. Los tests unitarios **nunca** usan la red real.
- **Componentes**: Testing Library, consultando por rol o etiqueta accesible (no por clases CSS).
- **E2E (Playwright)**: los flujos principales usan archivos locales de prueba (`e2e/fixtures/*.mp3`) para no depender de Spotify.
- Todo bug corregido va con un test de regresión que fallaba antes de la corrección.
- La matriz completa de casos está en `.agents/testing-plan.md`.

## 9. UI/UX

- **Modo claro por defecto**. Los colores se definen como tokens CSS en `:root`, y el modo oscuro se agrega después redefiniendo esos tokens.
- Accesibilidad **WCAG 2.1 AA**: contraste ≥ 4.5:1, foco visible, todo operable con teclado, `aria-label` en los botones de solo icono y `aria-live="polite"` en "Reproduciendo ahora".
- Toda vista tiene estados **vacío**, **cargando** y **error**, por ejemplo: lista vacía con una llamada a buscar o importar, sin login de Spotify, cuenta no Premium, sin Widevine o token expirado.
- Una acción principal por contexto: la canción actual se resalta en la lista y lo que hace cada acción debe ser evidente.
- Responsive desde 360 px de ancho.
- Para diseñar la UI, usar las skills de diseño instaladas (frontend-design, web-design-guidelines, ui-ux-pro-max, emil-kowalski…).
- La guía completa de UX de reproductores está en `.agents/music-player-guide.md`.
- **Tema "Japón antiguo"**: paleta, tipografías, texturas, motivos, componentes y reglas de animación en `.agents/design-theme.md`. Ningún color ni fuente se escribe directamente en un componente; todo sale de los tokens.
- Animaciones de scroll **sutiles**: aparecer con opacidad y unos pocos píxeles (≤ 12 px), sin rebotes, en 300 a 500 ms, una sola vez por elemento, y desactivadas con `prefers-reduced-motion`.
- Evitar a todas costa degradados genéricos. 
- Evita emojis.
- Evita las cards, bloques de texto con el borde en la izquierda. 

## 10. Spotify: reglas críticas

- El login usa **Authorization Code + PKCE**, sin backend. **Nunca** se usa ni se guarda un client secret en el frontend.
- Redirect URIs (se registran **las dos** en el Dashboard de Spotify): desarrollo `http://127.0.0.1:5173/` (Spotify no acepta `localhost`) y producción `https://nicoalsd.github.io/music-app/`. El callback vuelve a la **raíz** con `?code=…&state=…` (no hay ruta `/callback`, porque GitHub Pages no reescribe rutas), y `SpotifyAuth` lo procesa al arrancar. Vite usa `server.host = '127.0.0.1'` y `port: 5173` con `strictPort`.
- Scopes: `streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state`.
- **La lista doble es la fuente de verdad**: se reproduce una sola URI a la vez (`PUT /me/player/play?device_id=…` con `{ "uris": [uri] }`). **No** se usa la cola de Spotify.
- El SDK no tiene un evento de fin de canción; la detección está aislada en `SpotifyOutput` (ver `.agents/music-api-research.md`).
- Por los límites del modo Development en 2026: `search` devuelve como máximo `limit=10` (hay que paginar con `offset`), la app admite hasta 5 usuarios en la allowlist y ya no existen los endpoints batch (`GET /tracks?ids=`).
- Variables en `.env.local` (gitignored): `VITE_SPOTIFY_CLIENT_ID` y `VITE_SPOTIFY_REDIRECT_URI`. Hay que mantener `.env.example` actualizado.

## 11. Git y commits (OBLIGATORIO)

- **Repositorio**: `https://github.com/NicoalsD/music-app.git` (remote `origin`, rama principal `main`).
- **Cada commit lleva un tipo, un título y una descripción** (Conventional Commits), **en inglés** (sección 0):

```
<type>(<optional scope>): <short summary in imperative, ≤ 72 chars>

<body: what changed and why, wrapped at 72 chars. Bullets allowed.>
```

| Tipo | Cuándo |
|------|--------|
| `feat` | Funcionalidad nueva (por ejemplo, `feat(core): add insertAt to DoublyLinkedList`) |
| `fix` | Corrección de un bug (va con su test de regresión) |
| `test` | Solo tests |
| `refactor` | Cambio interno sin cambiar el comportamiento |
| `style` | Formato, CSS o tema visual sin cambiar la lógica |
| `docs` | Documentación (`AGENTS.md`, `.agents/`, README) |
| `chore` | Configuración, dependencias, tooling |
| `ci` | Workflows de GitHub Actions |
| `perf` | Rendimiento |

Ejemplo:
```
feat(core): add insertAt to DoublyLinkedList

Insert a node at any index in O(min(i, n-i)) by walking from the
closest end. Throws IndexOutOfRangeError outside 0..size.
Covers R4 of the workshop.
```

- **Nunca** hay commits sin cuerpo, ni mensajes como "update", "changes" o "wip".
- Cada commit es **atómico**: un solo cambio lógico, y deja `pnpm typecheck && pnpm lint && pnpm test` en verde.
- Las ramas se llaman `<type>/<kebab-description>` (`feat/insert-dialog`, `fix/remove-current-node`).
- No se suben `.env.local`, `dist/`, `coverage/` ni `node_modules/` (están en `.gitignore`).

## 12. Despliegue

- Se despliega en **GitHub Pages** con GitHub Actions: `https://nicoalsd.github.io/music-app/`. CI (typecheck, lint, tests con cobertura, E2E y build) corre en cada push y PR, y solo si CI pasa en `main` se despliega.
- Vite usa `base: '/music-app/'` en el build. El redirect URI de Spotify se calcula desde `import.meta.env.BASE_URL`.
- El plan completo (configuración, workflows, verificación y riesgos) está en `.agents/deployment.md`.

## Documentación de apoyo (`.agents/`)

| Archivo | Contenido |
|---------|-----------|
| [`.agents/music-player-guide.md`](.agents/music-player-guide.md) | Consulta extensa: todo lo que un reproductor de música debe considerar (inspirado en Spotify, Apple Music y Tidal) |
| [`.agents/music-api-research.md`](.agents/music-api-research.md) | Investigación de APIs: Spotify (elegida), Tidal y otras descartadas, archivos locales |
| [`.agents/architecture.md`](.agents/architecture.md) | Diagramas de capas, de clases y de secuencia |
| [`.agents/testing-plan.md`](.agents/testing-plan.md) | Plan de pruebas y matriz de casos |
| [`.agents/deployment.md`](.agents/deployment.md) | Plan de despliegue: GitHub Pages + GitHub Actions, configuración de Spotify y verificación |
| [`.agents/design-theme.md`](.agents/design-theme.md) | Tema visual "Japón antiguo": tokens, tipografías, texturas, motivos, componentes React gratuitos y animaciones de scroll |
