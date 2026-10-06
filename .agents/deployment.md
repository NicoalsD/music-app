# Plan de despliegue

**Decisión:** **GitHub Pages**, desplegado con **GitHub Actions** desde el repositorio `https://github.com/NicoalsD/music-app`.
**URL de producción:** `https://nicoalsd.github.io/music-app/`

## Por qué GitHub Pages

| Criterio | GitHub Pages | Vercel / Netlify / Cloudflare Pages |
|----------|--------------|-------------------------------------|
| Costo | Gratis (repositorio público) | Gratis (plan hobby) |
| HTTPS (Spotify lo exige fuera de loopback) | Sí, automático | Sí |
| Mismo lugar que el código y CI | Sí | Requiere conectar otra cuenta |
| Backend | No hace falta (PKCE funciona solo en el frontend) | — |
| Rutas SPA | No reescribe rutas, así que el callback vuelve a la raíz | Sí reescribe |

La app es **100 % estática**: el build de Vite genera `dist/` y no hay servidor ni secretos (el Client ID de Spotify es público por diseño cuando se usa PKCE).
**Alternativa** si algún día hace falta un backend o previews por PR: Vercel (`vercel.json` con un rewrite a `/index.html`).

## Configuración que hay que hacer una sola vez

1. **Repositorio**: en GitHub, Settings → Pages → Source: **GitHub Actions**.
2. **Variable del Client ID**: en Settings → Secrets and variables → Actions → **Variables**, crear `VITE_SPOTIFY_CLIENT_ID` con el Client ID de Spotify. Va como *variable* y no como *secret*, porque no es confidencial.
3. **Spotify Dashboard** → la app → Redirect URIs: agregar **las dos**:
   - `http://127.0.0.1:5173/` (desarrollo)
   - `https://nicoalsd.github.io/music-app/` (producción; debe llevar `/` al final, porque Spotify compara la cadena exacta)
4. **Spotify Dashboard** → User Management: agregar el email del profesor (máximo 5 usuarios en modo Development).

## Configuración de Vite

```ts
// vite.config.ts
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/music-app/' : '/',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
}));
```
- El redirect URI se calcula en tiempo de ejecución: `new URL(import.meta.env.BASE_URL, window.location.origin).href`, así no hace falta configurarlo por entorno. `VITE_SPOTIFY_REDIRECT_URI` es opcional y solo sirve para sobrescribirlo.
- Los assets se referencian siempre de forma relativa o con `import.meta.env.BASE_URL`, nunca con `/` absoluto.

## Pipeline (`.github/workflows/`)

### `ci.yml`: en cada push y PR
```yaml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test:coverage        # falla si no se cumplen los umbrales de cobertura
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
      - run: pnpm build
```

### `deploy.yml`: al hacer push a `main`, **solo si CI pasa**
```yaml
name: Deploy
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v4
        with: { ref: '${{ github.event.workflow_run.head_sha }}' }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
        env: { VITE_SPOTIFY_CLIENT_ID: '${{ vars.VITE_SPOTIFY_CLIENT_ID }}' }
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```
Las versiones de las actions se confirman al crear los workflows, contra el Marketplace de GitHub.

## Flujo de trabajo con ramas

1. Se trabaja en una rama (`feat/doubly-linked-list`, `fix/remove-current-node`…).
2. Se abre un PR a `main`; CI tiene que pasar en verde.
3. Merge a `main` → CI → **despliegue automático** a Pages.
4. Se verifica en producción con la checklist manual de `testing-plan.md`, sobre la URL de producción.

## Verificación después de cada despliegue

- [ ] `https://nicoalsd.github.io/music-app/` carga sin errores en la consola (sin 404 de assets, lo que confirma que `base` está bien).
- [ ] El login de Spotify vuelve a la app y la URL queda limpia, sin `?code=`.
- [ ] Una canción de Spotify suena completa, y también un archivo local.
- [ ] Recargar la página no rompe nada (la persistencia funciona).

## Riesgos conocidos

| Riesgo | Mitigación |
|--------|-----------|
| El redirect URI no coincide exactamente (falta la `/` final o hay mayúsculas) | Se calcula desde `BASE_URL`; el dominio de Pages va **en minúsculas** (`nicoalsd`) |
| El profesor no está en la allowlist | Agregarlo antes de la entrega; los archivos locales funcionan igual |
| Su navegador no tiene Widevine | Mensaje claro en la UI y archivos locales como alternativa |
| Repositorio privado | Pages gratis requiere un repositorio público (o GitHub Pro/Education: el GitHub Student Pack lo incluye) |
