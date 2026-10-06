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

**Panel shōji** (`.shoji`, para los paneles de Buscar y Mi lista, el reproductor, los menús, los diálogos y los toasts):
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

- **Escritorio**: la cabecera es una franja de papel con la ola *seigaiha*, el logo (un *hanko* con 音) y el buscador. Debajo hay dos columnas: **Buscar** (filtros Todo, Canciones, Artistas y Álbumes) y **Mi lista** (la lista doble con linternas). La barra del reproductor está fija abajo y tiene la carátula enmarcada, los controles y el cable con la golondrina.
- **Móvil**: tabs "Buscar" y "Mi lista" y un mini reproductor flotante de papel.
- **Detalle de artista y de álbum**: es un panel que **reemplaza** la columna de búsqueda, con un botón "← Volver". Así no se pierde de vista "Mi lista".
- Los márgenes son generosos, como el paspartú de un grabado: 24 a 32 px en escritorio y 16 px en móvil.
