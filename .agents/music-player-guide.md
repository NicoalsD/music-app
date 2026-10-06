# Guía extensa: lo que un agente de IA debe considerar al construir un reproductor de música

Se basa en el comportamiento de **Spotify**, **Apple Music**, **Tidal** y **YouTube Music**, adaptado a este taller (una lista doble como estructura central).
Cada sección termina con **Reglas para la implementación** y, cuando corresponde, con **Tests obligatorios**.

---

## 1. Modelo mental: playlist, cola y "reproduciendo ahora"

Las apps grandes separan tres conceptos:

| Concepto | Spotify / Apple Music | En este proyecto |
|----------|----------------------|------------------|
| **Playlist** (colección guardada) | Lista con nombre y persistente | `Playlist` → `DoublyLinkedList<Song>` |
| **Cola** ("Next up" / "A continuación") | Lista temporal que tiene prioridad sobre la playlist | Opcional (extra): una segunda `DoublyLinkedList` |
| **Contexto actual** | De dónde viene la canción que suena | `Playlist.current` (puntero a un nodo) |

- Spotify distingue **"Añadir a la cola"** (va al final de la cola) de **"Reproducir a continuación"**. Apple Music ofrece **"Reproducir después"** (justo después de la actual) y **"Reproducir al final"**.
- Equivalencias en el taller: "Reproducir a continuación" = `insertAt(indexOf(current) + 1)`, "Al final" = `insertLast` y "Al inicio" = `insertFirst`.

**Reglas para la implementación**
- El "punto de inserción relativo a la actual" es una acción de primera clase en la UI, porque es la más usada en las apps reales.
- La canción actual se identifica por **nodo y `entryId`**, nunca por índice: los índices cambian al insertar o eliminar antes de la actual.

**Tests obligatorios**
- Insertar antes de la canción actual no cambia cuál es la actual (aunque su índice sí cambie).
- "Reproducir a continuación" con la lista vacía equivale a `insertFirst` y además la convierte en la actual.

---

## 2. Controles de transporte

### 2.1 Play / Pausa
- Un único botón que alterna entre los dos estados, con el icono que refleja **la acción** (si está sonando, muestra pausa).
- Si se pulsa play con la lista vacía, el botón está deshabilitado y un mensaje invita a buscar o importar.
- Si se pulsa play sin una canción actual pero con la lista llena, empieza por `head`.

### 2.2 Siguiente (adelantar)
- `current = current.next`.
- En la cola: con repeat `all` va a `head`; con `off` se detiene en la última y queda en pausa al principio, como hace Spotify.
- Con shuffle activo, sigue el orden de shuffle (ver la sección 4).

### 2.3 Anterior (retroceder) y la regla de los 3 segundos
- **Todas** las apps grandes usan la misma regla: si la posición es **mayor que ~3 s**, "anterior" **reinicia** la canción actual; si es menor o igual, va a `current.prev`.
- En `head` con repeat `off`, reinicia; con `all`, va a `tail`.

### 2.4 Seek y scrubbing
- La barra de progreso se puede arrastrar y también hacer clic en ella. Mientras se arrastra, **no** se actualiza desde el audio, para que no "salte" bajo el dedo, y el seek se aplica al soltar.
- Se muestran el tiempo transcurrido y el total (`m:ss`, o `h:mm:ss` si dura más de una hora).
- Teclado: ←/→ para ±5 s (como YouTube y Spotify web).
- El seek se limita a `[0, duration]`.

### 2.5 Volumen y mute
- Slider de 0 a 100 y botón de mute que **recuerda** el volumen previo; al desmutear se restaura.
- Se persiste en `localStorage`.
- En Spotify, el volumen se aplica con `player.setVolume(0..1)`.

**Tests obligatorios**
- `previous` con position 3.5 s reinicia; con position 2 s retrocede.
- `next` en la cola con `off` deja el estado en pausa; con `all` va a `head`.
- Mute y luego unmute restaura el volumen anterior (no lo deja en 100).
- Un seek fuera de rango se limita.

---

## 3. Repetir (repeat)

Hay tres estados que rotan con un solo botón, igual que en Spotify, Apple Music y Tidal: **off → all → one → off**.

| Modo | Fin automático de la canción | Botón siguiente |
|------|------------------------------|-----------------|
| off | pasa a la siguiente y se detiene al final | siguiente; en la cola se detiene |
| all | pasa a la siguiente; en la cola vuelve a `head` | siguiente, de forma circular |
| one | **repite la misma canción** | **sí pasa a la siguiente** (como Spotify) |

- El icono de repeat one muestra un "1". El estado activo se distingue por color **y** por forma o indicador, no solo por color (requisito de a11y).

---

## 4. Aleatorio (shuffle)

- Al activarlo, la canción actual **sigue sonando** y el resto se reordena aleatoriamente después de ella (así lo hacen Spotify y Apple Music).
- Se usa **Fisher-Yates** con un `Random` inyectado: es uniforme y sin repeticiones dentro de una vuelta.
- **No se destruye la lista doble original**: se guarda un orden aparte, que es un array de `entryId` válido solo para navegar, o una segunda lista doble de referencias.
- Al desactivarlo, se vuelve al orden original y la siguiente canción es la que sigue a la actual en la lista original.
- Si se inserta una canción con shuffle activo, se agrega al orden de shuffle en una posición aleatoria posterior a la actual. Si se elimina una, se quita de los dos órdenes.
- Opcional: "Smart Shuffle" de Spotify. No aplica.

**Tests obligatorios**
- Con un `Random` fijo, el orden es determinista.
- Activar y desactivar shuffle conserva el orden original intacto.
- Shuffle con 0 o 1 canción no falla.
- Eliminar una canción con shuffle activo no deja referencias colgantes.

---

## 5. Avance automático, gapless y crossfade

- Cuando termina una canción (`ended` en HTML5, o la detección del SDK en Spotify), el engine llama a `onTrackEnded()`, que aplica las reglas de repeat y shuffle.
- **Gapless** (Apple Music y Tidal lo tienen para álbumes en vivo): con HTML5 se puede **precargar** la siguiente canción en un segundo `<audio>` con `preload="auto"`. Con Spotify no se controla. Es opcional.
- **Crossfade** (Spotify: de 0 a 12 s): es opcional, y en HTML5 se hace con dos elementos de audio y rampas de volumen. **No** se implementa para Spotify (el SDK no lo expone).
- Si una canción falla al cargar (`error`), se muestra un toast "No se pudo reproducir X" y se **salta** a la siguiente. Hay que cortar el bucle si **todas** fallan (un contador de fallos consecutivos menor que `size`).

**Tests obligatorios**
- `ended` con repeat `one` vuelve a reproducir la misma canción desde 0.
- Si todas las canciones fallan, el reproductor se detiene en vez de entrar en un bucle infinito.

---

## 6. Eliminar canciones

- La acción está disponible en el menú contextual (⋯) y en un botón de basura al pasar el cursor o enfocar la fila, con la tecla Supr/Delete sobre la fila enfocada.
- Spotify y Apple Music **no** piden confirmación al quitar una canción de la cola; en su lugar muestran **"Deshacer"**. Se hace igual: un toast "Canción eliminada · Deshacer" que dura 5 s y reinserta la canción en su posición original (se guardan el índice y el `entryId`).
- Si se elimina la canción **actual**: si estaba sonando, empieza a sonar la siguiente; si era la cola, se pasa a la anterior y queda en pausa; si la lista queda vacía, se detiene, se libera el output y se muestra el estado vacío.
- En los archivos locales, al eliminar definitivamente (cuando expira el "deshacer") se llama a `URL.revokeObjectURL`.
- Opcional: "Vaciar lista", con un diálogo de confirmación porque es destructiva.

**Tests obligatorios**: la tabla de casos borde de `AGENTS.md` (sección 6) completa.

---

## 7. Agregar canciones y "insertar en posición"

- Desde un resultado de búsqueda o un archivo importado hay cuatro acciones: **Reproducir ahora**, **Reproducir a continuación**, **Agregar al inicio**, **Agregar al final** y **Insertar en posición…**.
- **Insertar en posición…** abre un diálogo con un input numérico **en base 1** para el usuario (posición 1 = inicio), con un rango válido de 1 a size+1. Internamente se convierte a base 0, y el valor se valida antes de habilitar el botón.
  - Alternativa más intuitiva: arrastrar el resultado a la lista, con una línea indicadora de la posición de inserción.
- Feedback inmediato: un toast "Agregada en la posición 3" y una animación breve en la fila insertada.
- Se pueden agregar duplicados, porque cada entrada tiene su propio `entryId`.

**Tests obligatorios**
- Posición 0, size+2, decimales o texto: botón deshabilitado y mensaje de error.
- La conversión de base 1 a base 0 es correcta en los extremos.

---

## 8. Reordenar (drag & drop)

- Las filas se pueden arrastrar con un "handle" (⋮⋮). En teclado: foco en el handle, Espacio para tomar la fila, ↑/↓ para moverla y Espacio para soltarla, todo anunciado con `aria-live` (patrón de dnd-kit).
- Se implementa con `DoublyLinkedList.move(from, to)`, que reenlaza nodos sin crearlos de nuevo, así el `current` se mantiene.
- Librería sugerida: `@dnd-kit/core` + `@dnd-kit/sortable` (es accesible).

**Tests obligatorios**: `move` hacia adelante, hacia atrás, al mismo índice, a `head` y a `tail`, con las invariantes verificadas en cada caso y el `current` intacto.

---

## 9. Búsqueda

- Hay un input con debounce de 300 ms, y cada búsqueda nueva **cancela** la anterior con `AbortController`. Esto evita condiciones de carrera: que la respuesta vieja llegue después y pise la nueva.
- Spotify (2026): `limit` máximo de 10. Se muestran 10 resultados y un botón "Cargar más" que hace `offset += 10`.
- Estados: vacío ("Busca canciones en Spotify"), cargando (skeletons), sin resultados ("No encontramos…") y error (con reintento).
- Cada resultado muestra carátula, título, artista, duración, un badge "E" si es explícita y las acciones de la sección 7.
- Si no hay sesión de Spotify, la búsqueda muestra "Conecta tu cuenta de Spotify" y ofrece importar archivos locales.

---

## 10. "Reproduciendo ahora" y la barra del reproductor

- Hay una **barra fija** abajo, como en Spotify web y Apple Music web, con carátula, título, artista, controles, progreso y volumen.
- Opcional: una vista expandida con carátula grande.
- El título de la pestaña es `▶ Canción · Artista` mientras suena.
- Para lectores de pantalla, una región `aria-live="polite"` anuncia el cambio de canción.

---

## 11. Media Session API

```ts
navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork: [{ src, sizes: '640x640' }] });
navigator.mediaSession.setActionHandler('play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekto', handler);
navigator.mediaSession.setPositionState({ duration, position, playbackRate: 1 });
```
- Permite usar las teclas multimedia del teclado, los controles del sistema operativo y la pantalla de bloqueo del móvil.
- Va detrás de la interfaz `MediaSessionAdapter`, para que en los tests no exista `navigator.mediaSession`.

---

## 12. Atajos de teclado

| Tecla | Acción |
|-------|--------|
| Espacio | Play / Pausa |
| Shift + → / Shift + ← | Siguiente / Anterior |
| → / ← | Seek ±5 s |
| ↑ / ↓ (con foco en el volumen) | Volumen ±5 % |
| M | Mute |
| S | Shuffle |
| R | Rotar repeat |
| / o Ctrl+K | Enfocar la búsqueda |
| Supr | Eliminar la fila enfocada |
| ? | Mostrar los atajos |

- **No** se activan mientras el foco está en un `input`, un `textarea` o un elemento `contenteditable`.
- Espacio sobre un botón enfocado no debe ejecutar la acción dos veces: `preventDefault` en el handler global, salvo cuando el foco está en un botón.

---

## 13. Persistencia

- Se guardan en `localStorage` la playlist (las canciones de Spotify por URI y metadatos), el índice o `entryId` actual, la posición, el volumen, repeat y shuffle.
- Los archivos locales **no** se pueden restaurar (sus blob URLs mueren al recargar). Hay dos opciones: guardarlos en IndexedDB (opcional, cuidando el límite de tamaño) o mostrarlos como "no disponible, vuelve a importar".
- Todo acceso a `localStorage` va con try/catch, porque en modo privado puede fallar, y los datos se validan al cargarlos: si el esquema es inválido se descartan y se registra un warning.
- La clave lleva versión (`music-app:v1`) para poder migrar después.

---

## 14. Autoplay y gestos del usuario

- Los navegadores bloquean el audio hasta que haya un gesto del usuario. El primer `play()` siempre debe venir de un clic o una tecla.
- **Spotify SDK**: llamar a `player.activateElement()` dentro del primer clic de play (es obligatorio en Safari y en móvil).
- Si `play()` rechaza la promesa (`NotAllowedError`), se muestra "Pulsa play para empezar" y no se deja un estado "reproduciendo" falso.

---

## 15. Errores y estados del audio

| Evento / situación | UI |
|--------------------|----|
| `waiting` / `stalled` (HTML5) o `loading` (SDK) | Spinner en el botón de play |
| `error` (HTML5) | Toast y salto a la siguiente |
| SDK `initialization_error` | "Tu navegador no soporta la reproducción de Spotify (falta Widevine/DRM)" |
| SDK `authentication_error` | Renovar el token; si falla, pedir login otra vez |
| SDK `account_error` | "Se requiere Spotify Premium" |
| SDK `playback_error` | Toast y salto a la siguiente |
| HTTP 401 | Refresh del token y reintento una sola vez |
| HTTP 429 | Respetar `Retry-After` y mostrar "Demasiadas solicitudes, reintentando…" |
| HTTP 403 en modo Development | "Tu cuenta no está autorizada en esta app (allowlist)" |
| Sin conexión (`navigator.onLine`) | Banner; los archivos locales siguen funcionando |
| El dispositivo SDK se transfirió a otro (el usuario abrió Spotify en el móvil) | Detectar el `player_state_changed` nulo o ajeno, pausar la UI y mostrar "Reproduciendo en otro dispositivo" |

---

## 16. Accesibilidad (WCAG 2.1 AA)

- Los botones de solo icono llevan `aria-label` en español ("Reproducir", "Pausar", "Siguiente canción").
- Los toggles (shuffle, repeat) usan `aria-pressed`; repeat expone su modo en el label ("Repetir: todas").
- La barra de progreso es `<input type="range">` con `aria-valuetext="1:23 de 3:45"`.
- La lista es `role="list"` (o `listbox` si se puede seleccionar) y la fila actual lleva `aria-current="true"`.
- El foco es visible (`:focus-visible`) con un contraste ≥ 3:1. Los targets táctiles miden al menos 44×44 px.
- Se respeta `prefers-reduced-motion`.
- Contraste del texto ≥ 4.5:1 en modo claro. Cuidado con el gris claro sobre blanco.

---

## 17. Diseño visual: tema "Japón antiguo" (modo claro)

El diseño visual completo (paleta, tipografías, texturas, motivos, carátulas, componentes y animaciones) está en **`design-theme.md`**, que es obligatorio. Lo esencial:
- Fondo de papel *washi* con grano sutil, tinta *sumi* para el texto, índigo *ai* como único acento interactivo y el sello *hanko* bermellón para marcar la canción actual.
- Tipografías Shippori Mincho B1 (display) y Zen Kaku Gothic New (interfaz), con números tabulares en los tiempos.
- Los nodos de la lista doble se dibujan como linternas colgadas de un cordón, y la de la canción actual está encendida.
- Las carátulas son obligatorias, enmarcadas como un grabado montado, y hay una de respaldo generada si falta la imagen.
- Sin degradados genéricos, emojis ni tarjetas con borde a la izquierda. Las animaciones de scroll son sutiles: 8 a 12 px, entre 300 y 500 ms y una sola vez.

---

## 18. Atribución y términos de Spotify

- Se muestran el logo o el nombre de Spotify y un enlace "Abrir en Spotify" (`external_urls.spotify`) en el contenido que viene de Spotify, como exigen las Spotify Design & Branding Guidelines.
- No se descarga ni se guarda en caché el audio, no se modifican las carátulas (no se recortan con texto encima) y no se mezcla audio de Spotify con otros.
- El uso es educativo y no comercial, en modo Development.

---

## 19. Rendimiento

- `nodeAt(i)` recorre desde el extremo más cercano.
- La UI se renderiza a partir de `toArray()` memoizado por **versión** de la lista (un contador que se incrementa en cada mutación), no en cada tick del progreso.
- El progreso se actualiza con `requestAnimationFrame` o con un intervalo de 250 ms en un componente aislado, para no re-renderizar toda la lista.
- Las listas de más de 200 filas se virtualizan (opcional, con `@tanstack/react-virtual`).
- Las carátulas usan `loading="lazy"` y el tamaño adecuado (Spotify ofrece 64, 300 y 640 px).

---

## 20. Funciones de apps grandes: cuáles aplican aquí

| Función | App | ¿Aplica? |
|---------|-----|----------|
| Cola "A continuación" separada | Spotify, Apple Music | Extra opcional (segunda lista doble) |
| Historial "Reproducidas recientemente" | Todas | Extra fácil: una pila acotada |
| Letras sincronizadas | Spotify, Apple Music | No (no hay una API pública gratuita y fiable) |
| Sleep timer | Spotify móvil | Extra fácil |
| Velocidad de reproducción | Podcasts | No para la música |
| Ecualizador | Spotify móvil | No (sin Web Audio en el SDK) |
| Calidad de audio (HiFi, Atmos) | Tidal | No |
| Crossfade y gapless | Spotify y Apple Music | Solo con HTML5 y como opcional |
| Recomendaciones / radio | Todas | No (Spotify eliminó los endpoints en 2024) |
| Arrastrar para reordenar | Todas | Sí |
| Deshacer al eliminar | Spotify | Sí |
| Duración total de la lista | Apple Music | Sí |

---

## 21. Bugs clásicos de reproductores y cómo evitarlos

| # | Bug | Prevención | Test |
|---|-----|------------|------|
| 1 | Eliminar la canción actual deja `current` apuntando a un nodo desconectado | `Playlist.remove` reasigna `current` **antes** de desenlazar | unitario |
| 2 | Los punteros `prev` quedan mal tras `insertAt` en el medio | La invariante 3 se verifica en cada test | propiedades |
| 3 | La canción actual se identifica por índice y cambia al insertar antes | Se usa la referencia al nodo o el `entryId` | unitario |
| 4 | Dos canciones suenan a la vez al alternar Spotify y archivo local | El engine pausa el output anterior al cambiar | unitario con mocks |
| 5 | Doble clic en "siguiente" salta dos veces o deja un estado incoherente | Token de petición; solo la última se aplica | unitario |
| 6 | La respuesta de una búsqueda vieja pisa la nueva | `AbortController` | unitario |
| 7 | La barra de progreso salta mientras se arrastra | Flag `isScrubbing` | componente |
| 8 | Los atajos se activan mientras se escribe en la búsqueda | Ignorar los eventos con target editable | componente |
| 9 | Bucle infinito si todas las canciones fallan | Contador de fallos consecutivos | unitario |
| 10 | Fuga de memoria por blob URLs | `revokeObjectURL` al eliminar definitivamente | unitario |
| 11 | El token expira a mitad de la sesión | Refresh proactivo 60 s antes de `expires_in` y reintento en el 401 | unitario |
| 12 | El fin de canción de Spotify se detecta dos veces (y salta dos) | Se guarda el `trackId` ya "terminado" y se ignoran los duplicados | unitario |
| 13 | El fin de canción de Spotify nunca se detecta | Polling de respaldo con `getCurrentState()` | unitario con fake timers |
| 14 | Estado "reproduciendo" falso si `play()` rechaza | Esperar la promesa y revertir en el catch | unitario |
| 15 | `insertAt(size)` lanza un error en vez de insertar al final | Rango `0..size` | unitario |
| 16 | Desbordamiento de `localStorage` o JSON corrupto que rompe el arranque | try/catch y validación del esquema | unitario |
| 17 | `StrictMode` monta dos veces y crea dos players del SDK | Singleton e inicialización idempotente con limpieza en el `useEffect` | componente |
| 18 | Shuffle repite canciones o se salta otras | Fisher-Yates y tests con un `Random` fijo | unitario |
