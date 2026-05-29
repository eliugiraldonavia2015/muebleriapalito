# Diseño: Una foto por color en cada producto

**Fecha:** 2026-05-28
**Estado:** Aprobado (pendiente de plan de implementación)

## Objetivo

Permitir que cada producto tenga, por color, su propia foto. Al subir o editar
un producto desde el admin, el usuario debe poder agregar colores con foto
fácilmente y volver a agregar más después. En la página de producto, al hacer
clic en un color, la foto principal cambia a la de ese color.

Decisiones tomadas en brainstorming:
- **Una foto por color** (no varias por color).
- **Sin nombre de color** — solo el cuadrito de color + su foto.
- **La foto del primer color es la foto principal** (la que sale en catálogo,
  home y carrito). No hay subida de "foto principal" aparte.

## Enfoque elegido

**Opción A:** el campo `colors` deja de ser un array de strings hex y pasa a ser
un array de objetos `{ hex, image }`. Un normalizador hace retrocompatible el
formato viejo (string suelto) para no migrar la base a mano.

Descartadas:
- **B (array paralelo `colorImages`):** dos listas que sincronizar → frágil.
- **C (subcolección de variantes):** sobre-ingeniería; no hay stock ni precio
  por color (YAGNI).

## Modelo de datos (Firestore, colección `products`)

| Campo | Antes | Después |
|---|---|---|
| `colors` | `["#8B4513", "#000000"]` | `[{ hex: "#8B4513", image: "https://cdn.../a.jpg" }, { hex: "#000000", image: "https://cdn.../b.jpg" }]` |
| `primaryImage` / `imageUrl` | subida aparte | **= foto del primer color** (se setea solo al guardar) |
| `images` / `gallery` | sin uso real en el form | (sin cambios; no se toca en este alcance) |

- **Retrocompatibilidad:** una función `normalizeColor(c)` devuelve
  `{ hex, image }` tanto si `c` es un string (`"#8B4513"` →
  `{ hex: "#8B4513", image: null }`) como si ya es objeto. Toda lectura de
  colores pasa por este normalizador. No se migran los documentos existentes;
  se actualizan uno por uno al editarlos desde el admin.

## Componentes y cambios por archivo

### 1. Helper de normalización (compartido)
- `normalizeColor(c)` → `{ hex, image }`. Ubicación: donde viva el código
  compartido de lectura (revisar `js/catalog-data.js`); si no calza, se duplica
  un helper mínimo inline en cada renderer. Decisión final en el plan.

### 2. Admin — `admin/index.html` + `js/admin.js`
- La sección de colores del formulario de producto se rehace: cada fila =
  - selector de color (`input type=color`) — como ahora,
  - **botón "Subir foto"** que abre el mismo flujo de recorte 3:4
    (`openCropModal` + `uploadImageToBunny(..., "products")`) y guarda la URL
    en la fila,
  - miniatura de la foto cargada,
  - botón eliminar fila.
- `editingProdColors` pasa de `string[]` a `{ hex, image }[]`.
- "+ Agregar color" agrega una fila nueva (color por defecto, sin foto).
- Al abrir un producto existente: `editingProdColors = (p.colors || []).map(normalizeColor)`.
- **Validación nueva:** en vez de exigir `prodImage`, exigir **al menos 1 color
  con `image` no vacío**. Mensaje claro si falta.
- Al guardar (submit):
  - `colors = [...editingProdColors]` (objetos),
  - `primaryImage = imageUrl = colors.find(c => c.image)?.image` (primer color
    con foto),
  - resto de campos sin cambios.

### 3. Página de producto — `js/producto-renderer.js`
- `buildColors(colors)`: normaliza cada color; al hacer clic en un cuadrito,
  cambia `#main-img` y el loupe a `c.image` con el mismo fade que usa
  `buildThumbs` (líneas 79-89). Mantiene `selectedColor = c.hex`.
- `buildThumbs`: la lista de miniaturas se arma con las fotos de los colores
  (las `image` no vacías), para que el cliente vea todas de un vistazo.
  Si solo hay una, la tira se oculta (comportamiento actual).
- La recolección de `images` (líneas 739-746) incorpora las fotos de colores.

### 4. Catálogo y Home — `js/catalogo-renderer.js`, `js/index-renderer.js`
- `colorsHTML` (catalogo-renderer:79) y el `.map` de swatches
  (index-renderer:433-434) leen `normalizeColor(c).hex` para el
  `style="background:..."`. Cambio mínimo, solo para no romper con el formato
  nuevo de objeto.

## Flujo de datos

1. Admin sube una foto por color → cada foto va a Bunny CDN → URL guardada en la
   fila de color.
2. Al guardar: `colors: [{hex,image}...]` y `primaryImage = colors[0].image`.
3. Catálogo/Home leen `primaryImage` (sin cambios) y dibujan los cuadritos con
   `normalizeColor(c).hex`.
4. Página de producto dibuja los cuadritos y miniaturas; clic en un color →
   swap de la foto principal a `c.image`.

## Manejo de errores y casos borde

- **Producto viejo (colors = strings, primaryImage propia):** se normaliza a
  `{hex, image:null}`; sigue mostrando su `primaryImage`; los cuadritos no
  cambian la foto hasta que el admin les suba foto. No se rompe nada.
- **Color sin foto en el form:** la validación bloquea el guardado si NINGÚN
  color tiene foto. Colores individuales sin foto: permitidos, pero no aparecen
  como miniatura ni hacen swap (o se decide en el plan exigir foto por color).
- **Subida a Bunny falla:** mismo toast de error que ya existe; la fila queda
  sin foto y la validación lo detecta al guardar.

## Pruebas (verificación manual)

Este proyecto es HTML/JS estático sin suite de tests. Verificación manual:
1. Crear producto nuevo con 2 colores + foto cada uno → se guarda, catálogo
   muestra la foto del primer color, página de producto cambia foto al clic.
2. Editar un producto viejo (colors string) → se ve sin romperse; agregar fotos
   por color → se guarda en formato nuevo.
3. Intentar guardar sin ninguna foto → validación lo bloquea.
4. Producto con 1 solo color → tira de miniaturas oculta, foto correcta.

## Fuera de alcance (YAGNI)

- Varias fotos por color.
- Nombres de color visibles.
- Stock o precio por color.
- Migración masiva de documentos existentes.
