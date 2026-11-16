# PAVING · sitio de avance

Prototipo publicado para revisión del cliente. **No es el sitio definitivo.**

- **Publicado:** https://mesaumadridg-art.github.io/paving-web-avance/
- **Repo:** `mesaumadridg-art/paving-web-avance` (público, GitHub Pages desde `master`, raíz)
- **Estado y decisiones:** `..\ESTADO.md`, secciones 16 y 17

---

## Estructura

```
06_Web/
├── index.html          trece secciones
├── css/estilos.css     sistema de diseño completo
├── js/app.js           calculador, dos visores, scrolly y comparador
└── assets/             imágenes WebP, cuatro videos, pósteres y logos
```

## Publicar

```bash
cd "C:/Users/mesau/documentos/PAVING/06_Web"
git add -A
git commit -m "descripción del cambio"
git push origin master
```

Pages reconstruye en 30-60 s. Confirmar con:

```bash
gh api repos/mesaumadridg-art/paving-web-avance/pages/builds/latest --jq '.status'
```

**Ojo con la caché:** el CSS y el JS servidos por Pages se cachean en el navegador
y un cambio puede parecer que no subió. Para comprobar de verdad:

```js
fetch('css/estilos.css').then(r=>r.text()).then(t=>t.includes('#39454F'))
```

o abrir DevTools → Network → *Disable cache*.

---

## Cómo se regeneran los medios

**Video del terreno** (79 MB → 3 MB):
```bash
ffmpeg -i "Animación 3D_.mp4" -vf "scale=1100:-2,fps=24" \
  -c:v libx264 -crf 32 -preset slower -pix_fmt yuv420p \
  -movflags +faststart -an assets/mdt.mp4
```

**Barridos del bus** (entrada y salida de TGU): mismo comando con `scale=720:-2`
(vertical) y `scale=1100:-2`, CRF 30.

**Póster de cada video:**
```bash
ffmpeg -ss 1 -i assets/mdt.mp4 -frames:v 1 assets/mdt_poster.jpg
```

**Fotos → WebP:** desde `..\05_Retroalimentacion\_seleccion\`, ancho máximo
1200-1920 según uso, `quality=82`, `method=6`. Las imágenes originales de cámara
llegan hasta 4160 px; las de WhatsApp solo a 1600.

---

## Reglas del proyecto

- **Nada inventado.** Donde falta un dato hay un hueco marcado, no un número de relleno.
- **Todo declarado como prototipo**: banda superior, pie e indicadores de muestra.
- **El cálculo es real**: AASHTO 1993 resuelto numéricamente, no una tabla falsa.
- **Contraste mínimo 4,5:1** en todo texto. Se mide, no se estima.
- **Colores con nombre**, nunca hex sueltos en los componentes.
- **Pendiente antes de publicar como definitivo:** quitar `noindex`, sustituir
  contacto y cifras, y cargar los proyectos autorizados.
