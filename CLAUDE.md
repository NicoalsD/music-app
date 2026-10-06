# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Las reglas del proyecto (requisitos del taller, stack, comandos, arquitectura, invariantes, testing, UX y Spotify) están en `AGENTS.md`, que es la fuente única. No las dupliques aquí:

@AGENTS.md

## Notas específicas para Claude Code

- **Regla de idioma (crítica)**: todo el código va en **inglés**, incluidos clases, métodos, variables, archivos, endpoints, comentarios, tests y commits. La documentación va en **español**, y los textos de la UI también, centralizados en `src/ui/i18n/es.ts`. Está en la sección 0 de `AGENTS.md`.

- **Commits**: siempre con el formato `<type>(<scope>): <summary>` **más un cuerpo** que explique qué cambió y por qué, en inglés (sección 11 de `AGENTS.md`). Commits atómicos y con los tests en verde.
- **Diseño**: tema "Japón antiguo" en modo claro, según `.agents/design-theme.md`.
- Antes de modificar `src/player/`, `src/auth/` o `src/providers/`, lee `.agents/music-api-research.md` y `.agents/architecture.md`.
- Antes de diseñar o cambiar la UI, consulta `.agents/music-player-guide.md` y usa las skills globales de diseño (`frontend-design`, `web-design-guidelines`, `ui-ux-pro-max`, `vercel-react-best-practices`, `vercel-composition-patterns`, `emil-design-eng`, `animate`, `review-animations`, `break-ui`, `ask-sonner` para los toasts y `bencium-innovative-ux-designer`) y, para auditar la accesibilidad, AccessLint.
- Antes de agregar o cambiar comportamiento, revisa `.agents/testing-plan.md` y agrega los casos que falten.
- Para mostrar la app corriendo, usa `pnpm dev`, que sirve en `http://127.0.0.1:5173`; Spotify no funciona en `localhost`.
