# Diseño: Colores y materiales estándar + foto por variación de color

**Fecha:** 2026-05-28
**Estado:** Aprobado en concepto (pendiente de revisión final del spec → plan)

## Objetivo

1. **Estandarizar colores y materiales en el dashboard.** El admin define una
   paleta de colores estándar y una lista de materiales estándar en un solo
   lugar. Para agregar un color/material nuevo, se va al dashboard y se agrega.
2. **Al cargar un ítem, elegir de lo estándar.** Un ítem se arma con
   **variaciones**: cada variación = 1 color (elegido de la paleta) + su foto.
   Si el ítem tiene 3 variaciones, solo esos 3 colores aparecen (de los N de la
   paleta). Los materiales se eligen de la lista estándar (varios por ítem).
3. **Foto por variación.** Cada variación tiene su propia foto subida en ese
   ítem (cada mueble se ve distinto). El color estándar solo aporta el cuadrito
   (hex) y un nombre interno.

### Decisiones tomadas en brainstorming
- Colores y materiales se **estandarizan en el dashboard** (settings).
- Ítem = varias **variaciones**; cada variación = 1 color estándar + 1 foto.
- Solo los colores elegidos para el ítem se muestran como cuadritos.
- **Materiales a nivel del ítem** (no por color); un ítem puede tener varios.
- Cada color estándar tiene **nombre interno** (solo visible en el admin; el
  cliente ve solo el cuadrito).
- La foto del **primer color/variación es la foto principal** (catálogo, home,
  carrito siguen leyendo `primaryImage` sin cambios).

## Enfoque elegido

- **Paletas estándar** en el documento `settings/store`:
  - `colorPalette`: array de `{ hex, name }` (name = etiqueta interna).
  - `materialList`: array de strings.
- **Producto** (`products`):
  - `colors`: array de variaciones `{ hex, image }` — `hex` viene de la paleta,
    `image` es la foto de esa variación en ese ítem.
  - `materials`: array de strings (subconjunto de `materialList`), nivel ítem.
- **Retrocompatibilidad** vía normalizadores: el formato viejo (colors como
  strings, `material` como string único) se lee sin romperse; no se migra la
  base a mano.

Descartadas:
- Foto ligada al color estándar (todos los ítems compartirían foto) → no sirve
  para muebles.
- Array paralelo / subcolección de variantes → frágil o sobre-ingeniería (YAGNI).

## Modelo de datos

### `settings/store` (documento único)
| Campo | Tipo | Descripción |
|---|---|---|
| `colorPalette` | array | `[{ hex: "#8B4513", name: "Café" }, ...]` — paleta estándar |
| `materialList` | array | `["Madera", "Tapizado", "Metal"]` — materiales estándar |

### `products`
| Campo | Antes | Después |
|---|---|---|
| `colors` | `["#8B4513"]` | `[{ hex: "#8B4513", image: "https://cdn.../a.jpg" }, ...]` (variaciones) |
| `material` | string único | (se mantiene por compat; ver `materials`) |
| `materials` | — | array de strings elegidos de `materialList` |
| `primaryImage` / `imageUrl` | subida aparte | **= foto de la primera variación** (se setea solo al guardar) |

- **`normalizeColor(c)`** → `{ hex, image }`: si `c` es string →
  `{ hex: c, image: null }`; si es objeto, se devuelve tal cual.
- **`normalizeMaterials(p)`** → array: usa `p.materials` si existe; si no y hay
  `p.material` (string), devuelve `[p.material]`; si no, `[]`.
- No se migran documentos existentes; se actualizan al editarlos en el admin.

## Componentes y cambios por archivo

### 1. Dashboard — gestión de paletas estándar (`admin/index.html` + `js/admin.js`)
- Nueva sección en el dashboard (junto a settings) para administrar:
  - **Colores estándar:** lista de filas `cuadrito (input color) + nombre +
    eliminar`, y botón "+ Agregar color". Se persiste en
    `settings/store.colorPalette` (usa el flujo de guardado de settings ya
    existente: `setDoc`/`updateDoc` sobre `COL_SETTINGS`/"store", notify OK008).
  - **Materiales estándar:** lista de `texto + eliminar` y "+ Agregar material".
    Se persiste en `settings/store.materialList`.

### 2. Admin — formulario de producto (`admin/index.html` + `js/admin.js`)
- **Variaciones de color:** se reemplaza el input libre de color por un selector
  basado en la paleta:
  - Se muestran los colores de `colorPalette` como chips seleccionables
    (cuadrito + nombre interno).
  - Al seleccionar un color de la paleta, se agrega una **fila de variación**:
    cuadrito (solo lectura, del estándar) + **botón "Subir foto"** (mismo flujo
    `openCropModal` 3:4 + `uploadImageToBunny(..., "products")`) + miniatura +
    quitar variación.
  - No se puede repetir el mismo color en dos variaciones del mismo ítem.
  - Si la paleta está vacía, se muestra un aviso con enlace a "agregá colores en
    el dashboard".
- **Materiales:** multi-select (checkboxes/chips) poblado desde `materialList`.
  Se guardan en `materials` (array). Aviso si la lista está vacía.
- `editingProdColors` pasa a `{ hex, image }[]`; nuevo estado `editingProdMaterials`
  (array de strings).
- Al abrir un producto: `editingProdColors = (p.colors||[]).map(normalizeColor)`,
  `editingProdMaterials = normalizeMaterials(p)`.
- **Validación nueva:** exigir **al menos 1 variación con foto** (reemplaza la
  exigencia de `prodImage`). Materiales: opcional (o mínimo 1 — a decidir en plan).
- Al guardar:
  - `colors = [...editingProdColors]`,
  - `materials = [...editingProdMaterials]`,
  - `primaryImage = imageUrl = colors.find(c => c.image)?.image`,
  - resto sin cambios.

### 3. Página de producto (`js/producto-renderer.js`)
- `buildColors`: normaliza; clic en cuadrito → cambia `#main-img` + loupe a
  `c.image` con el fade existente. Cuadritos = solo las variaciones del ítem.
- `buildThumbs`: miniaturas = fotos de las variaciones (las `image` no vacías).
- `buildSpecs` (línea 430): agregar fila **"Material"** con
  `normalizeMaterials(product).join(", ")` si hay materiales.

### 4. Catálogo y Home (`js/catalogo-renderer.js`, `js/index-renderer.js`)
- `colorsHTML` (catalogo-renderer:79) y swatches de home (index-renderer:433-434)
  leen `normalizeColor(c).hex` para `style="background:..."`. Cambio mínimo.

## Flujo de datos

1. Admin define paleta de colores y lista de materiales en el dashboard →
   `settings/store`.
2. Al cargar un ítem: elige colores de la paleta (cada uno = variación con su
   foto) y materiales de la lista → fotos van a Bunny CDN.
3. Guardar: `colors:[{hex,image}]`, `materials:[...]`,
   `primaryImage = colors[0].image`.
4. Catálogo/Home leen `primaryImage` (sin cambios) y cuadritos por
   `normalizeColor(c).hex`.
5. Página de producto: cuadritos + miniaturas por variación; clic en color →
   swap de foto. Specs muestran materiales.

## Manejo de errores y casos borde

- **Producto viejo** (colors strings, `material` único, primaryImage propia): se
  normaliza; sigue mostrándose; al editarlo se migra al formato nuevo.
- **Color de la paleta eliminado después** de usarse en un ítem: el ítem
  conserva su `{hex, image}`; el cuadrito sigue mostrándose por hex. No se
  rompe; simplemente ese color ya no estará disponible para nuevos ítems.
- **Paleta o lista de materiales vacía:** el form del producto avisa y enlaza al
  dashboard; la validación impide guardar sin al menos 1 variación con foto.
- **Subida a Bunny falla:** mismo toast/banner de error existente; la variación
  queda sin foto y la validación lo detecta al guardar.

## Pruebas (verificación manual)

Proyecto HTML/JS estático sin suite de tests. Verificación manual:
1. Dashboard: agregar 5 colores estándar (con nombre) + 3 materiales → se
   persisten en `settings/store`.
2. Nuevo producto: elegir 3 colores de la paleta, subir foto a cada uno, marcar
   2 materiales → se guarda; catálogo muestra la foto de la 1ª variación;
   página de producto cambia foto al clic; specs muestran los materiales.
3. Editar producto viejo → se ve sin romperse; migrar a variaciones + materiales.
4. Guardar sin foto en ninguna variación → validación lo bloquea.
5. Eliminar del dashboard un color ya usado → el ítem que lo usaba sigue OK.

## Fuera de alcance (YAGNI)

- Varias fotos por variación (sigue siendo 1 foto por variación).
- Nombre de color visible al cliente.
- Stock o precio por color/variación.
- Migración masiva de documentos existentes.
- Material por color (los materiales son a nivel de ítem).
