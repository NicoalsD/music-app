# Tema visual: "Japón antiguo"

Referencias que dio el usuario:
- Grabados *shin-hanga* (golondrinas en cables, de Ivo Saliger; tonos índigo y nube).
- Etiquetas de cerillas de la era *Shōwa* (bloques planos de color, kanji grandes, rosa y verde lima).
- Linternas de acuarela.
- Ramas de sakura de estilo botánico.
- El póster de Ponyo.
- La portada de *La Mer* de Debussy (1905), basada en *La gran ola* de Hokusai: contorno índigo oscuro, verde jade, gris piedra y título ocre sobre papel gris cálido.

**La idea**: un objeto impreso de los años 1900 a 1950, sereno, con papel, tinta y sellos, que funciona como una app moderna. **Siempre en modo claro**, porque el papel es el fondo.

---

## 1. Tokens de color (`src/ui/theme/tokens.css`)

| Token | Hex | Nombre tradicional | Uso |
|-------|-----|--------------------|-----|
| `--paper` | `#F1EADB` | *Washi* | Fondo de la app |
| `--paper-raised` | `#F8F4EA` | *Shironeri* | Superficies (paneles, menús) |
| `--paper-sunk` | `#E7DEC9` | *Kinari* | Inputs, zonas hundidas, pistas de los sliders |
| `--ink` | `#1E1C22` | *Sumi* | Texto principal (≈ 14:1 sobre `--paper`) |
| `--ink-soft` | `#4E4A52` | *Usuzumi* | Texto secundario (≈ 7:1) |
| `--ink-faint` | `#6A655F` | *Nezumi* | Metadatos y tiempos (≈ 4.9:1) |
| `--line` | `#CFC5B0` | — | Divisores y bordes suaves |
| `--ai` | `#22306A` | *Ai* (índigo) | **Acento principal**: botón de play, foco, enlaces y contorno de grabado |
| `--ai-wash` | `#DCE1EE` | — | Fondo de la fila seleccionada |
| `--shu` | `#B4432E` | *Shu* (bermellón) | **Sello *hanko***: canción actual, estado activo y errores (≈ 5.3:1) |
| `--jade` | `#6FA58C` | *Seiji* | Decorativo: olas y patrones (nunca en texto) |
| `--sakura` | `#E9A9AB` | *Sakura* | Decorativo: pétalos y fondos de etiquetas |
| `--ochre` | `#A87A24` | *Kincha* | Títulos ornamentales grandes (≥ 24 px) |
| `--sora` | `#A9C0DA` | *Sora* | Decorativo: cielo y nubes |
| `--plum` | `#4A2C33` | *Ebicha* | Bloques de etiqueta de cerilla y fondo de la carátula de respaldo |

Reglas:
- **Nada de degradados genéricos** (regla del usuario). El color es plano, como en la impresión xilográfica; la profundidad sale de la textura y del registro de tintas.
- El acento interactivo es **uno solo** (`--ai`). `--shu` está reservado al sello del estado activo y a los errores. El resto de los colores son decorativos.
- Los estados nunca se distinguen solo por el tono; además cambian la forma o el peso (por ejemplo, el sello *hanko* aparece o desaparece).

## 2. Tipografía (Google Fonts, gratuitas, con soporte latin-ext para tildes y ñ)

| Rol | Fuente | Pesos |
|-----|--------|-------|
| Display (títulos, título de la canción actual) | **Shippori Mincho B1** | 600, 800 |
| Texto de interfaz | **Zen Kaku Gothic New** | 400, 500, 700 |
| Kanji ornamentales | Shippori Mincho B1 | 800 |

- Los números (tiempos y posiciones) usan `font-variant-numeric: tabular-nums`.
- Hay **kanji ornamentales verticales** (`writing-mode: vertical-rl`) como en las etiquetas Shōwa. Por ejemplo, 音楽 ("música") en la cabecera, 再生中 ("reproduciendo") junto a la canción actual y 一覧 ("lista") en el título de la lista. Siempre llevan `aria-hidden="true"` y su significado va en `title`, para no confundir a los lectores de pantalla. Son decoración y no reemplazan texto en español.
- Escala: 12, 13, 15 y 18 px, y 24, 32 y 44 px para display. Interlineado de 1.5 en el texto y de 1.15 en display.

## 3. Texturas y motivos

| Motivo | Dónde | Cómo |
|--------|-------|------|
| **Grano de papel *washi*** | Fondo de toda la app | Un SVG con `feTurbulence` (baseFrequency ≈ 0.8, opacidad 6–8 %) como `background-image` del `body`, con `mix-blend-mode: multiply`. Ocupa menos de 1 KB y no lleva imágenes. |
| ***Seigaiha*** (olas en abanico) | Franja de la cabecera y estado vacío | `<pattern>` SVG en `--jade` y `--ai` a baja opacidad |
| **Ola de Hokusai** | Ilustración del estado vacío y del login | SVG de trazo índigo con espuma (puntos), plano y sin degradado |
| **Sello *hanko*** | Canción actual, logo y carátula de respaldo | Cuadrado de 2 px de radio en `--shu`, con un kanji blanco (再 = "reproducir") y bordes irregulares hechos con `feTurbulence` + `feDisplacementMap` |
| **Marco de grabado** | Carátulas | La imagen va dentro de un *paspartú* de papel de 4 px, con un contorno de 1.5 px en `--ink`, como un grabado montado |
| **Linternas (*chōchin*)** | **Nodos de la lista doble** | Cada nodo de la línea es una linterna pequeña (SVG de 12×16) colgada del cordón (la línea vertical). La de la canción actual está **encendida** (`--shu`) y las demás son de papel. |
| **Cables con golondrinas** | Barra de progreso | El progreso es un cable fino de tinta, y la "cabeza" (el thumb) es una pequeña golondrina índigo. Solo es decoración: el control real es un `<input type="range">` de Radix Slider. |
| **Etiqueta de cerillas** | Chips de filtro y sección del artista | Bloques de color plano (`--plum`, `--sakura`) con tipografía display, sin sombras |


## 3.1 Transparencia "Shōji" (*liquid glass* japonés)

Lo pidió el usuario: un efecto de transparencia o *liquid glass* integrado al tema. La traducción es el **shōji**: paneles de papel de arroz translúcido que dejan pasar la luz y las formas de lo que hay detrás, desenfocadas. **Es el elemento memorable del diseño; el resto se mantiene sobrio.**

**Escena de fondo** (`<BackdropScene/>`, fija y detrás de todo, `position: fixed; z-index: -1`):
- Papel *washi* con grano, el **sol bermellón** grande (un círculo `--shu` de unos 38 vmin, arriba a la derecha), la **gran ola** índigo y jade abajo a la izquierda y una **rama de sakura** cruzando una esquina. Todo en SVG plano, sin degradados.
- **Parallax** muy leve con `useScroll`: el sol baja 24 px y la ola sube 16 px a lo largo de todo el scroll. Con `prefers-reduced-motion` queda estático.
- Opcional: el color del sol toma el tono dominante de la carátula actual (se extrae del canvas), con una transición de 600 ms.

**Panel shōji** (`.shoji`, para los paneles de Buscar, Biblioteca y Reproduciendo ahora, el reproductor, los menús, los diálogos y los toasts):
```css
.shoji {
  background: color-mix(in oklab, var(--paper-raised) 62%, transparent);
  backdrop-filter: blur(18px) saturate(1.15);
  -webkit-backdrop-filter: blur(18px) saturate(1.15);
  border: 1.5px solid color-mix(in oklab, var(--ink) 85%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.55),      /* reflejo superior: el "liquid" */
    inset 0 0 0 1px rgba(255,255,255,.18),
    4px 4px 0 rgba(30,28,34,.10);               /* sombra de papel apilado */
  border-radius: 6px;
}
.shoji::before { /* grano de papel de arroz sobre el vidrio */
  content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background-image: var(--washi-grain); opacity: .10; mix-blend-mode: multiply;
}
```
- **Kumiko** (la celosía del shōji): en la barra del reproductor y en la cabecera, unas líneas finas de la retícula (1 px, `--ink` al 12 %) cada 64 px, como los listones de madera.
- **Variación por profundidad**: los paneles principales usan un blur de 18 px y una opacidad del 62 %; los menús y diálogos, 24 px y 74 %, para leerse mejor porque están "más cerca".
- **Respaldo**: si no hay soporte para `backdrop-filter` (`@supports not (backdrop-filter: blur(1px))`), el panel queda opaco con `--paper-raised`.
- **Contraste**: el texto sobre el shōji debe mantener ≥ 4.5:1 en el peor caso, que es encima del sol bermellón. Por eso la opacidad mínima del panel es del 62 % y el texto secundario usa `--ink-soft`, no `--ink-faint`.
- **Rendimiento**: no se anidan paneles shōji (el blur dentro de un blur es caro) y no se anima `backdrop-filter`.

Prohibido (son reglas del usuario y de los tropos de IA): degradados genéricos, emojis, tarjetas con un borde de color a la izquierda, sombras difusas grandes, etiquetas en MAYÚSCULAS con tracking, fuentes monoespaciadas para datos pequeños y la flecha '→' añadida a botones o enlaces. Si hace falta elevar algo, se usa una sombra de "papel apilado": `0 1px 0 var(--line), 0 2px 0 rgba(30,28,34,.06)`.

## 4. Carátulas (obligatorias)

- **Spotify**: `album.images`. La de 64 px va en las filas, la de 300 px en los resultados y la de 640 px en la vista "Reproduciendo ahora". Llevan `loading="lazy"`, `decoding="async"` y `alt="Portada de {álbum}"`.
- **Archivos locales**: la imagen embebida en el ID3 (con `music-metadata`).
- **Respaldo** (sin imagen, o si falla la carga con `onError`): un cuadrado `--plum` con la inicial del título en Shippori Mincho color `--paper` y un sello *hanko* pequeño en una esquina. Se genera de forma determinista a partir del título, para que no "salte" entre renders.
- **Nunca** se recortan ni se tapan las carátulas de Spotify con texto, por los términos de Spotify.

## 5. Componentes React gratuitos

| Necesidad | Librería | Licencia | Por qué |
|-----------|----------|----------|---------|
| Dialog, DropdownMenu, ContextMenu, Tabs, Slider, Tooltip, ScrollArea, ToggleGroup | **Radix UI Primitives** (`@radix-ui/react-*`) | MIT | Sin estilo y accesibles (foco, teclado, ARIA), así el tema se aplica al 100 %. Base UI es una alternativa equivalente. |
| Animaciones, scroll e insertar/eliminar | **Motion** (`motion`, se importa desde `motion/react`) | MIT | `whileInView`, `useScroll`, `layout` y `AnimatePresence` |
| Reordenar arrastrando (con teclado) | **@dnd-kit/core** + **@dnd-kit/sortable** | MIT | Accesible, con anuncios para lectores de pantalla |
| Avisos con "Deshacer" | **sonner** | MIT | Admite acciones, se le puede quitar el estilo y es accesible |
| Iconos | **lucide-react** | ISC | Trazo de 1.5 px, que combina con el grabado |
| Metadatos de los archivos locales | **music-metadata** | MIT | ID3 y carátula embebida en el navegador |
| Listas largas (opcional) | **@tanstack/react-virtual** | MIT | Virtualizar más de 200 filas |
| Fila horizontal de álbumes (opcional) | **embla-carousel-react** | MIT | Scroll horizontal con snap y accesible |

**No** se usa shadcn/ui tal cual (su estética por defecto es genérica). Se pueden **copiar** sus patrones de composición sobre Radix, pero con nuestro CSS.

## 6. Animaciones (sutiles)

Principios: **el papel no rebota**. Movimientos cortos, con *ease-out*, que parezcan tinta asentándose y no rebotes. Duración de 180 a 500 ms y desplazamiento máximo de 12 px. Todo se desactiva con `useReducedMotion()`, que deja solo el fundido de opacidad.

| Momento | Animación | Implementación |
|---------|-----------|----------------|
| Al hacer scroll, aparecen las secciones y los resultados | `opacity 0→1`, `y 8→0` en 400 ms, con un escalonado de 30 ms entre filas (máximo 8 filas escalonadas) | `motion.li` con `initial`, `whileInView` y `viewport={{ once: true, amount: 0.2 }}` |
| Cabecera *seigaiha* | Parallax muy leve: `y 0 → −16px` al bajar 300 px | `useScroll()` + `useTransform` |
| Insertar una canción | La fila crece desde altura 0 y aparece con un fundido; la linterna "cuelga" con un `rotate` de 4° a 0° | `AnimatePresence` + `layout` |
| Eliminar | Fundido y colapso de altura en 220 ms; las demás filas se reacomodan con `layout` | `exit` |
| Cambio de canción actual | El sello *hanko* aparece con `scale 1.15→1` y `opacity` en 180 ms, como un sello estampado | `motion.span` con `key={entryId}` |
| Play y pausa | Morph de icono con un cruce de 120 ms | — |
| Carátula de "Reproduciendo ahora" | Fundido cruzado de 300 ms entre portadas | `AnimatePresence mode="popLayout"` |

**Prohibido**: animar la lista entera en cada tick del progreso, *scroll-jacking* (nada de Lenis ni de smooth-scroll forzado), rebotes con *spring* exagerados y animaciones en bucle salvo el indicador de "sonando".

## 7. Layout

La estructura se inspira en el reproductor web de Spotify y en los clientes minimalistas de escritorio: una cabecera, una barra lateral con la biblioteca, un panel principal que cambia de vista y un reproductor fijo abajo. La forma es la de siempre, pero el papel, las etiquetas y los sellos son los del tema.

**Vistas del panel principal** (un único estado de navegación, sin rutas de servidor):

| Vista | Qué muestra |
|-------|-------------|
| `home` | Continuar escuchando, Tus playlists y Agregadas recientemente. Se construye **solo con estado local**, porque los endpoints de exploración y recomendaciones de Spotify están restringidos para apps nuevas. |
| `search` | El buscador con los filtros Todo, Canciones, Artistas y Álbumes. |
| `playlist` | La lista doble de la playlist activa, con las linternas, el reordenado arrastrando y el menú por canción. |
| `album` | Las canciones del álbum y "Agregar álbum completo". Tiene el botón "Volver". |
| `artist` | Los álbumes del artista. Tiene el botón "Volver". |

**Escritorio (desde 1024 px)**
- **Cabecera**: una franja de papel con la ola *seigaiha* en el borde inferior. De izquierda a derecha: el logo (un *hanko* con 音), el botón "Inicio", el buscador centrado (con su etiqueta visible o accesible), el estado de la conexión con Spotify (siempre con texto, nunca solo con color) y el botón de atajos de teclado.
- **Barra lateral "Biblioteca"** (unos 280 px, con el kanji 一覧 decorativo en el título):
  - Navegación con "Inicio" y "Buscar". La vista activa lleva `aria-current="page"`.
  - La lista de playlists. La playlist activa lleva el sello *hanko* y `aria-current="true"`.
  - El botón "Crear", que abre un diálogo para dar el nombre.
  - Un botón de menú por playlist (`aria-label` con el nombre) con "Renombrar" y "Eliminar". Si es la única playlist, "Eliminar" queda deshabilitada con el motivo escrito en el menú.
  - "Importar archivos" al pie, con el mismo flujo que el arrastrar y soltar.
- **Panel principal**: ocupa el resto del ancho y tiene su propio scroll. La cabecera y la barra lateral no se desplazan.
- **Reproductor fijo abajo** (unos 88 px): a la izquierda, la carátula enmarcada, el título y los artistas. En el centro, los controles y el cable de progreso con su golondrina. A la derecha, el volumen con mute, el botón **"Letra"** y el botón **"Reproduciendo ahora"**, que expande la vista de la sección 7.1.

**Tableta (768 a 1023 px)** *(propuesta)*
- La barra lateral se reduce a un riel de 64 px con solo iconos. Cada icono tiene `aria-label` y un *tooltip* de Radix.
- Desde el icono "Biblioteca" se abre la lista de playlists como panel superpuesto, con el mismo contenido que la barra lateral.
- El panel principal ocupa el resto del ancho. Las columnas de resultados pasan de tres a dos.

**Móvil (menos de 768 px)**
- No hay barra lateral. La cabecera queda compacta: logo y estado de Spotify. El buscador vive en la vista "Buscar".
- **Navegación inferior** con tres destinos: Inicio, Buscar y Biblioteca. Va **encima del mini reproductor**, que queda pegado al borde inferior. "Biblioteca" muestra la misma lista de playlists que la barra lateral.
- El mini reproductor es una tira de papel con la carátula pequeña, el título, play y pausa, y el botón "Reproduciendo ahora".
- El contenido tiene padding inferior suficiente para que la navegación y el mini reproductor no tapen el último elemento.
- Los objetivos táctiles miden al menos 44 px. El margen lateral es de 16 px y no hay desplazamiento horizontal a 360 px de ancho.

**Reglas comunes**
- **Volver**: al abrir un álbum o un artista desde los resultados, "Volver" regresa a la vista anterior con su filtro, su texto de búsqueda y su posición de scroll. Si no hay vista anterior, "Volver" lleva a "Buscar".
- **Estados**: cada vista tiene estado vacío (con una acción: buscar o importar), cargando y error (con reintentar). Sin login de Spotify, el panel de búsqueda explica qué falta y no muestra resultados vacíos.
- Los márgenes son generosos, como el paspartú de un grabado: 24 a 32 px en escritorio y 16 px en móvil.

## 7.1 Reproduciendo ahora

Es la vista de inmersión de la canción actual, inspirada en la vista de reproducción del cliente QML de Spotify. Se abre desde el botón "Reproduciendo ahora" de la barra. El botón "Letra" la abre con el panel de letra en primer plano. En escritorio ocupa el panel principal y la barra inferior sigue visible. En móvil ocupa toda la pantalla.

**Apertura y cierre**
- Se cierra con **Esc** o con el botón "Cerrar" (con `aria-label`). Al cerrar, el foco vuelve al botón que la abrió.
- Al abrir, el foco entra en el título de la canción.
- La vista se mantiene sincronizada con la canción actual. Si la canción cambia, la carátula, la letra y el fondo cambian con ella.

**Columna izquierda (escritorio: unos 45 % del ancho)**
- **Carátula grande** de hasta 640 px, dentro de un paspartú de papel de 4 px y con un contorno de 1.5 px en `--ink`. Si no tiene imagen, va el respaldo *hanko* de la sección 4. El `alt` es "Portada de {álbum}".
- **Anillo decorativo** alrededor de la carátula: un trazo fino en `--ink`, con `aria-hidden="true"`. Es solo decoración. Spotify protege el audio con DRM, así que no hay visualizador real y el anillo **no reacciona al sonido**. Tampoco gira ni pulsa en bucle.
- **Título** en Shippori Mincho 600 (32 px en móvil y 44 px en escritorio), los **artistas** en Zen Kaku Gothic 500 y el **álbum** en `--ink-soft`. El título es la región con `aria-live="polite"` de "Reproduciendo ahora".
- **Progreso**: el mismo cable de tinta con la golondrina como control. Es un Slider de Radix, así que se opera con las flechas. Los tiempos usan `tabular-nums`.
- **Controles**: anterior, play y pausa, siguiente, repeat y shuffle en una fila, con el volumen y el mute debajo. Todos los botones de solo icono tienen `aria-label`.

**Columna derecha (escritorio) o debajo de la carátula (móvil)**
- **Letra** sobre un panel shōji (sección 3.1), con el texto de atribución "Letras: LRCLIB" en `--ink-soft`.
- **Estados de la letra**:
  - *Cargando*: el texto "Buscando la letra…", sin spinner en bucle.
  - *Sincronizada*: las líneas con su tiempo.
  - *Texto plano*: el texto completo, desplazable, sin resaltado y sin seek.
  - *Instrumental*: "Canción instrumental".
  - *No disponible*: "No encontramos letra para esta canción". No ofrece reintentar, porque la respuesta fue "no existe".
  - *Error*: "No se pudo cargar la letra", con el botón "Reintentar".
- **Líneas sincronizadas**:
  - La línea activa va en `--ink`, en peso 700 y con `aria-current="true"`. Las demás van en `--ink-soft`, en peso 400.
  - El desplazamiento automático centra la línea activa. Con `prefers-reduced-motion` el salto es instantáneo.
  - Si el usuario se desplaza a mano por la letra, el auto-desplazamiento se pausa durante unos 4 s y luego vuelve a seguir la línea activa.
  - Cada línea es un botón. Un clic o Enter sobre ella hace seek a su tiempo. Las líneas de texto plano no son botones.
  - No hay `aria-live` por línea, para no leer toda la letra mientras suena. El anuncio queda en el título.

**Fondo (escena de la sección 3.1)**
- El **sol** toma el tono dominante de la carátula actual. Ese tono se extrae de un canvas pequeño, se cuantiza y se aplica como un color **plano**, sin degradados ni blur.
- La transición de color dura 600 ms.
- La carátula **no** se difumina como fondo.
- Si no hay carátula o la extracción falla, el sol vuelve a `--shu`.
- El color llega por la variable CSS `--sun`, que se define en el contenedor de la vista. Es la única excepción a la regla de "ningún color directo en un componente": solo colorea el sol y nunca el texto.
- Todo el texto va sobre el panel shōji, nunca directamente sobre el sol, para mantener el contraste de 4.5:1.

**Animación**
- La entrada de la vista es un fundido de opacidad con un desplazamiento de hasta 8 px, en 300 ms. Con `prefers-reduced-motion` queda solo el fundido.
- El cambio de carátula es un fundido cruzado de 300 ms (sección 6).
- No hay animaciones en bucle dentro de la vista.
