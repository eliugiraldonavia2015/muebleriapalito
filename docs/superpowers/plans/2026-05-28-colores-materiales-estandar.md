# Colores y materiales estándar + foto por variación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estandarizar colores (paleta) y materiales (lista) en el dashboard, y que cada producto se arme con variaciones (1 color de la paleta + su foto) y materiales elegidos de la lista.

**Architecture:** Las paletas viven en `settings/store` (`colorPalette`, `materialList`) y se editan dentro del `settingsForm` existente (un solo botón Guardar). El producto guarda `colors` como `[{hex,image}]` (variaciones) y `materials` como `string[]`. Un módulo compartido `js/product-normalizers.js` hace retrocompatibles los formatos viejos. La foto de la 1ª variación se copia a `primaryImage` al guardar, así catálogo/home/carrito no cambian.

**Tech Stack:** HTML estático + JavaScript ES modules, Firebase Firestore (v11 desde CDN), Bunny CDN para imágenes, GSAP. Sin framework ni suite de tests automatizada — verificación manual en navegador, salvo el módulo de normalizadores (smoke test con `node`).

**Verificación:** este proyecto no tiene test runner. Para lógica pura (normalizadores) se usa un smoke test con `node`. Para UI se usa verificación manual en el navegador, descrita paso a paso. Servir el sitio con `python3 -m http.server 8000` desde la raíz del repo y abrir las URLs indicadas.

---

## Mapa de archivos

- **Crear:** `js/product-normalizers.js` — `normalizeColor(c)` y `normalizeMaterials(p)`. Funciones puras, sin dependencias.
- **Crear:** `scripts/test-normalizers.mjs` — smoke test con `node` del módulo anterior.
- **Modificar:** `js/catalogo-renderer.js` — `colorsHTML` lee `normalizeColor(c).hex`.
- **Modificar:** `js/index-renderer.js` — swatches del home leen `normalizeColor(c).hex`.
- **Modificar:** `js/producto-renderer.js` — `buildColors` cambia la foto principal al clic; `buildThumbs` se arma desde las variaciones; `buildSpecs` muestra materiales.
- **Modificar:** `admin/index.html` — dos cards nuevas en `#settingsForm` (paleta de colores + lista de materiales); reemplazo del bloque "Colores disponibles" del form de producto por chips de paleta + variaciones; nuevo bloque de materiales.
- **Modificar:** `js/admin.js` — render/lectura de paleta y materiales en settings; lógica del form de producto (variaciones con foto por color, materiales, validación, submit).

---

## Task 1: Módulo de normalizadores compartido

**Files:**
- Create: `js/product-normalizers.js`
- Test: `scripts/test-normalizers.mjs`

- [ ] **Step 1: Crear el módulo de normalizadores**

Crear `js/product-normalizers.js`:

```js
// Normalizadores de datos de producto. Hacen retrocompatibles los formatos
// viejos (colors como strings sueltos, material como string único) con los
// nuevos (colors como variaciones {hex,image}, materials como array).
// Funciones puras, sin dependencias — usables desde renderers y admin.

// Devuelve siempre { hex, image }.
//  - "#8B4513"                -> { hex: "#8B4513", image: null }
//  - { hex, image }           -> { hex, image: image||null }
export function normalizeColor(c) {
  if (c && typeof c === "object") {
    return { hex: c.hex || "", image: c.image || null };
  }
  return { hex: c || "", image: null };
}

// Devuelve siempre un array de strings de materiales a nivel de ítem.
//  - { materials: ["Madera","Metal"] } -> ["Madera","Metal"]
//  - { material: "Madera" }            -> ["Madera"]
//  - sin nada                          -> []
export function normalizeMaterials(p) {
  if (p && Array.isArray(p.materials)) {
    return p.materials.filter(m => typeof m === "string" && m.trim());
  }
  if (p && typeof p.material === "string" && p.material.trim()) {
    return [p.material.trim()];
  }
  return [];
}
```

- [ ] **Step 2: Escribir el smoke test**

Crear `scripts/test-normalizers.mjs`:

```js
import { normalizeColor, normalizeMaterials } from "../js/product-normalizers.js";

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}: got ${a}, want ${e}`); failed++; }
  else { console.log(`ok   ${label}`); }
}

eq(normalizeColor("#8B4513"), { hex: "#8B4513", image: null }, "color string");
eq(normalizeColor({ hex: "#000", image: "u" }), { hex: "#000", image: "u" }, "color objeto");
eq(normalizeColor({ hex: "#000" }), { hex: "#000", image: null }, "color objeto sin image");
eq(normalizeColor(null), { hex: "", image: null }, "color null");

eq(normalizeMaterials({ materials: ["Madera", "Metal"] }), ["Madera", "Metal"], "materials array");
eq(normalizeMaterials({ material: "Madera" }), ["Madera"], "material único");
eq(normalizeMaterials({ materials: ["", "  ", "Metal"] }), ["Metal"], "materials filtra vacíos");
eq(normalizeMaterials({}), [], "sin materiales");

if (failed) { console.error(`\n${failed} test(s) fallaron`); process.exit(1); }
console.log("\nTodos los tests pasaron");
```

- [ ] **Step 3: Correr el test y verificar que pasa**

Run: `node scripts/test-normalizers.mjs`
Expected: imprime `ok ...` por cada caso y termina con `Todos los tests pasaron` (exit 0).

- [ ] **Step 4: Commit**

```bash
git add js/product-normalizers.js scripts/test-normalizers.mjs
git commit -m "feat: modulo de normalizadores de color/material con smoke test"
```

---

## Task 2: Retrocompat de swatches en catálogo y home

Objetivo: que los cuadritos de color sigan dibujándose bien cuando `colors`
pase a ser `[{hex,image}]`. Cambio mínimo y seguro (no rompe datos viejos).

**Files:**
- Modify: `js/catalogo-renderer.js:79-82` (función `colorsHTML`)
- Modify: `js/index-renderer.js` (top: import; línea ~433-434: swatches)

- [ ] **Step 1: Importar normalizeColor en catalogo-renderer.js**

En `js/catalogo-renderer.js`, justo después de la línea
`import { firebaseConfig } from "./firebase-config.js";` (línea 12), agregar:

```js
import { normalizeColor } from "./product-normalizers.js";
```

- [ ] **Step 2: Usar normalizeColor en colorsHTML**

Reemplazar el cuerpo de `colorsHTML` (líneas 79-83 aprox.). Buscar:

```js
function colorsHTML(colors) {
  if (!colors || !colors.length) return "";
  return `<div class="product-colors-mini">` + colors.map((c, i) =>
```

y reemplazar la línea del `.map` para que use el hex normalizado. El bloque
completo debe quedar:

```js
function colorsHTML(colors) {
  if (!colors || !colors.length) return "";
  return `<div class="product-colors-mini">` + colors.map((c, i) => {
    const hex = normalizeColor(c).hex;
    return `<div class="color-swatch-mini${i === 0 ? " active" : ""}" style="background:${hex}"></div>`;
  }).join("") + `</div>`;
}
```

(Nota: conservar las clases CSS exactas que ya usa el archivo. Si el `.map`
original usa otra clase/markup, mantener ese markup y solo cambiar `${c}` por
`${normalizeColor(c).hex}`.)

- [ ] **Step 3: Importar normalizeColor en index-renderer.js**

En `js/index-renderer.js`, después de
`import { firebaseConfig } from "./firebase-config.js";` (línea 17), agregar:

```js
import { normalizeColor } from "./product-normalizers.js";
```

- [ ] **Step 4: Usar normalizeColor en los swatches del home**

En `js/index-renderer.js` (línea ~433-434), buscar:

```js
        ${p.colors && p.colors.length > 0 ? `<div class="product-colors">
          ${p.colors.map((c, i) => `<div class="color-swatch${i === 0 ? " active" : ""}" style="background:${c}"></div>`).join("")}
```

y reemplazar la línea del `.map` por:

```js
          ${p.colors.map((c, i) => `<div class="color-swatch${i === 0 ? " active" : ""}" style="background:${normalizeColor(c).hex}"></div>`).join("")}
```

- [ ] **Step 5: Verificación manual (datos viejos siguen OK)**

Run: `python3 -m http.server 8000` (en la raíz del repo) y abrir
`http://localhost:8000/index.html` y `http://localhost:8000/catalogo.html`.
Expected: los cuadritos de color de los productos existentes (que aún tienen
`colors` como strings) se ven igual que antes (color correcto, sin
`[object Object]`). La consola del navegador no muestra errores de import.

- [ ] **Step 6: Commit**

```bash
git add js/catalogo-renderer.js js/index-renderer.js
git commit -m "feat: catalogo y home leen color via normalizeColor (retrocompat)"
```

---

## Task 3: Página de producto — swap de foto por color, miniaturas por variación y materiales en specs

**Files:**
- Modify: `js/producto-renderer.js` (import; `buildColors` 95-113; recolección de imágenes 739-760; `buildSpecs` 430-459)

- [ ] **Step 1: Importar normalizadores en producto-renderer.js**

En `js/producto-renderer.js`, después de
`import { firebaseConfig } from "./firebase-config.js";` (línea 6), agregar:

```js
import { normalizeColor, normalizeMaterials } from "./product-normalizers.js";
```

- [ ] **Step 2: Reescribir buildColors para que el clic cambie la foto principal**

Reemplazar la función completa `buildColors` (líneas 95-113) por:

```js
// ─── COLOR SWATCHES (variaciones) ───
// Cada color es una variación {hex, image}. Clic en un cuadrito cambia la foto
// principal (mismo fade que las miniaturas) a la foto de esa variación.
function buildColors(colors) {
  const wrap = $("#prod-colors-wrap");
  const container = $("#prod-colors");
  if (!colors || !colors.length) { if (wrap) wrap.style.display = "none"; return; }
  if (!container) return;

  const norm = colors.map(normalizeColor).filter(c => c.hex);
  if (!norm.length) { if (wrap) wrap.style.display = "none"; return; }

  selectedColor = norm[0].hex;
  norm.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "cswatch" + (i === 0 ? " active" : "");
    div.style.background = c.hex;
    div.title = c.hex;
    div.addEventListener("click", () => {
      container.querySelectorAll(".cswatch").forEach(s => s.classList.remove("active"));
      div.classList.add("active");
      selectedColor = c.hex;
      if (!c.image) return;
      const mainImg = $("#main-img");
      if (!mainImg) return;
      gsap.to(mainImg, { opacity: 0, duration: 0.18, onComplete: () => {
        mainImg.src = c.image;
        const loupe = $("#loupe");
        if (loupe) loupe.style.backgroundImage = "url(" + c.image + ")";
        gsap.to(mainImg, { opacity: 1, duration: 0.25 });
      }});
    });
    container.appendChild(div);
  });
}
```

- [ ] **Step 3: Armar las miniaturas desde las fotos de las variaciones**

En `renderProduct` (alrededor de líneas 739-760), localizar el bloque que
construye `images`:

```js
  // Collect images
  const images = [];
  if (product.imageUrl) images.push(product.imageUrl);
  if (product.primaryImage && product.primaryImage !== product.imageUrl) images.push(product.primaryImage);
  if (Array.isArray(product.images)) {
    product.images.forEach(u => { if (u && !images.includes(u)) images.push(u); });
  }
  if (!images.length) images.push("https://via.placeholder.com/800x900");
```

Reemplazarlo por (agrega las fotos de las variaciones de color, deduplicadas):

```js
  // Collect images: fotos de las variaciones de color primero, luego las
  // imágenes sueltas legacy. Dedupe por URL.
  const images = [];
  const pushImg = (u) => { if (u && !images.includes(u)) images.push(u); };
  (product.colors || []).forEach(c => pushImg(normalizeColor(c).image));
  pushImg(product.imageUrl);
  pushImg(product.primaryImage);
  if (Array.isArray(product.images)) product.images.forEach(pushImg);
  if (!images.length) images.push("https://via.placeholder.com/800x900");
```

(`buildThumbs(images)` y `buildColors(product.colors)` ya se llaman justo
debajo — no se tocan esas llamadas.)

- [ ] **Step 4: Mostrar materiales en specs**

En `buildSpecs` (líneas 436-441), localizar:

```js
  const fields = [
    ["Categoria", product.category],
    ["Subcategoria", product.subcategory],
    ["SKU", product.id],
    ["Disponibilidad", product.available !== false ? "Disponible" : "Agotado"],
  ].filter(([, v]) => v);
```

Reemplazar por (agrega la fila "Material"):

```js
  const materials = normalizeMaterials(product);
  const fields = [
    ["Categoria", product.category],
    ["Subcategoria", product.subcategory],
    ["Material", materials.join(", ")],
    ["SKU", product.id],
    ["Disponibilidad", product.available !== false ? "Disponible" : "Agotado"],
  ].filter(([, v]) => v);
```

- [ ] **Step 5: Verificación manual**

Run: con `python3 -m http.server 8000`, abrir la página de un producto
existente, p. ej. `http://localhost:8000/producto.html?id=<algún-id>`.
Expected:
- Producto viejo (colors string, sin foto por color): cuadritos visibles; clic
  NO rompe nada (no hay foto que cambiar); specs sin fila "Material" si no tiene.
- La consola no muestra errores.
(La verificación completa del swap de foto se hace en Task 6, cuando el admin ya
puede guardar variaciones con foto.)

- [ ] **Step 6: Commit**

```bash
git add js/producto-renderer.js
git commit -m "feat: producto cambia foto por color, miniaturas por variacion y materiales en specs"
```

---

## Task 4: Dashboard — editor de paleta de colores y lista de materiales en settings

**Files:**
- Modify: `admin/index.html` (dentro de `#settingsForm`, antes de `</form>` en línea ~1250+; el form empieza en 1250)
- Modify: `js/admin.js` (`populateSettingsForm` 2594-2629; submit de settings 2690-2725)

- [ ] **Step 1: Agregar las dos cards al settingsForm (HTML)**

En `admin/index.html`, dentro de `<form id="settingsForm" ...>` (abre en línea
1250). Agregar este bloque como una sección más del form (por ejemplo justo
antes de la sección de `storeLocations`; si no se ubica con certeza, agregarlo
inmediatamente después de la etiqueta `<form id="settingsForm" ...>`):

```html
<div class="admin-card" style="padding:24px">
  <h3 style="margin:0 0 4px">Paleta de colores estandar</h3>
  <p style="font-size:12px;color:var(--gray);margin:0 0 16px">Estos colores son los que podras elegir al cargar un producto. El nombre es solo para identificarlos aqui (el cliente ve solo el cuadrito).</p>
  <div id="paletteColors"></div>
  <button type="button" class="btn btn-ghost btn-sm" id="addPaletteColorBtn" style="margin-top:10px">+ Agregar color</button>
</div>

<div class="admin-card" style="padding:24px">
  <h3 style="margin:0 0 4px">Materiales estandar</h3>
  <p style="font-size:12px;color:var(--gray);margin:0 0 16px">Estos materiales son los que podras marcar en cada producto.</p>
  <div id="materialList"></div>
  <button type="button" class="btn btn-ghost btn-sm" id="addMaterialBtn" style="margin-top:10px">+ Agregar material</button>
</div>
```

- [ ] **Step 2: Agregar helpers de render de filas (admin.js)**

En `js/admin.js`, justo antes de `function populateSettingsForm()` (línea 2594),
agregar:

```js
// ─── PALETA DE COLORES ESTANDAR (settings) ───
function addPaletteColorRow(data = {}) {
  const container = document.getElementById("paletteColors");
  const row = document.createElement("div");
  row.className = "color-input-wrap";
  row.style.marginTop = "8px";
  row.dataset.paletteRow = "1";

  const color = document.createElement("input");
  color.type = "color";
  color.value = data.hex || "#8b7355";
  color.dataset.paletteHex = "1";

  const name = document.createElement("input");
  name.type = "text";
  name.placeholder = "Nombre (ej. Cafe)";
  name.value = data.name || "";
  name.dataset.paletteName = "1";
  name.style.flex = "1";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());

  row.append(color, name, remove);
  container.appendChild(row);
}

function readPaletteColors() {
  return [...document.querySelectorAll("[data-palette-row]")].map(row => ({
    hex: row.querySelector("[data-palette-hex]").value,
    name: row.querySelector("[data-palette-name]").value.trim(),
  })).filter(c => c.hex);
}

// ─── LISTA DE MATERIALES ESTANDAR (settings) ───
function addMaterialRow(value = "") {
  const container = document.getElementById("materialList");
  const row = document.createElement("div");
  row.className = "color-input-wrap";
  row.style.marginTop = "8px";
  row.dataset.materialRow = "1";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Nombre del material (ej. Madera)";
  input.value = value;
  input.dataset.materialName = "1";
  input.style.flex = "1";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());

  row.append(input, remove);
  container.appendChild(row);
}

function readMaterialList() {
  return [...document.querySelectorAll("[data-material-row]")]
    .map(row => row.querySelector("[data-material-name]").value.trim())
    .filter(Boolean);
}
```

- [ ] **Step 3: Poblar las filas al cargar settings**

Al final de `populateSettingsForm()` (después de la línea
`(s.storeLocations || []).forEach(store => addStoreBlock(store));`, línea 2628),
agregar:

```js
  document.getElementById("paletteColors").replaceChildren();
  (s.colorPalette || []).forEach(c => addPaletteColorRow(c));
  document.getElementById("materialList").replaceChildren();
  (s.materialList || []).forEach(m => addMaterialRow(m));
```

- [ ] **Step 4: Wire de los botones "+ Agregar"**

Después de la línea
`document.getElementById("resetSettingsBtn").addEventListener("click", () => populateSettingsForm());`
(línea 2739), agregar:

```js
document.getElementById("addPaletteColorBtn").addEventListener("click", () => addPaletteColorRow());
document.getElementById("addMaterialBtn").addEventListener("click", () => addMaterialRow());
```

- [ ] **Step 5: Persistir paleta y materiales en el submit de settings**

En el objeto `data` del submit de settings (líneas 2690-2725), agregar dos
propiedades antes de `updatedAt: serverTimestamp(),` (línea 2724):

```js
    colorPalette: readPaletteColors(),
    materialList: readMaterialList(),
```

(El guardado usa `setDoc(..., data, {merge:true})` y luego `settings = data`;
como ahora `data` incluye ambos campos, el estado en memoria queda correcto.)

- [ ] **Step 6: Verificación manual**

Run: con el sitio servido, abrir `http://localhost:8000/admin/` → iniciar
sesión → sección **Configuracion**.
Expected:
- Aparecen las cards "Paleta de colores estandar" y "Materiales estandar".
- "+ Agregar color" añade fila (cuadrito + nombre + ×); "+ Agregar material"
  añade fila (texto + ×).
- Agregar 5 colores (con nombre) y 3 materiales → "Guardar" → toast OK008.
- Recargar la página (Cmd+Shift+R) → las filas reaparecen con los valores
  guardados (confirma persistencia en `settings/store`).

- [ ] **Step 7: Commit**

```bash
git add admin/index.html js/admin.js
git commit -m "feat: dashboard administra paleta de colores y materiales estandar"
```

---

## Task 5: Form de producto — variaciones de color desde la paleta (con foto por variación)

**Files:**
- Modify: `admin/index.html` (bloque "Colores disponibles" 1511-1519; bloque imagen 1476-1486)
- Modify: `js/admin.js` (estado `editingProdColors`; `renderColorSwatches` 3121-3145; handlers de color 3109-3119; `openProductDrawer` 2977-3020; validación y submit 3147-3193; uploader de imagen 3058-3099)

- [ ] **Step 1: Reemplazar el HTML del bloque de colores del producto**

En `admin/index.html`, reemplazar el bloque completo "Colores disponibles"
(líneas 1511-1519):

```html
        <div class="form-group full">
          <label>Colores disponibles</label>
          <div style="display:flex;gap:8px">
            <input type="color" id="prodColorInput" value="#8b7355" style="width:36px;height:36px;border:1px solid var(--rule);border-radius:4px;padding:2px;cursor:pointer"/>
            <input type="text" id="prodColorText" placeholder="#8b7355" style="flex:1"/>
            <button type="button" class="btn btn-ghost btn-sm" id="addColorBtn">+</button>
          </div>
          <div class="color-inputs" id="prodColors"></div>
        </div>
```

por:

```html
        <div class="form-group full">
          <label>Variaciones de color (elige de la paleta del dashboard)</label>
          <p id="paletteHint" style="font-size:12px;color:var(--gray);margin:0 0 8px"></p>
          <div id="prodPaletteChips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px"></div>
          <div class="color-inputs" id="prodColors"></div>
        </div>
```

(El bloque "Imagen del producto" de las líneas 1476-1486 ya no se usa para subir;
la foto principal sale de la 1ª variación. Reemplazar ese bloque por un campo
oculto que conserve compatibilidad del submit:)

Reemplazar el bloque (líneas 1476-1486):

```html
        <div class="form-group full">
          <label>Imagen del producto</label>
          <div style="display:flex;gap:12px;align-items:center">
            <img id="prodImagePreview" src="" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--rule);background:var(--charcoal-deep);display:none"/>
            <div style="flex:1">
              <input type="file" id="prodImageFile" accept="image/*" style="font-size:13px;color:var(--cream);cursor:pointer"/>
              <input type="hidden" id="prodImage"/>
              <p id="prodImageStatus" style="font-size:11px;color:var(--gray);margin:4px 0 0"></p>
            </div>
          </div>
        </div>
```

por:

```html
        <input type="hidden" id="prodImage"/>
```

- [ ] **Step 2: Cambiar el estado de colores a variaciones {hex,image}**

En `js/admin.js`, el form ahora maneja variaciones. `editingProdColors` pasa de
`string[]` a `{hex,image}[]`. Reemplazar la función `renderColorSwatches`
completa (líneas 3121-3145) por una que renderiza la paleta como chips y las
variaciones elegidas como filas con foto:

```js
// Dibuja los chips de la paleta (settings.colorPalette). Click en un chip que
// no está usado agrega una variación; si ya está usado, no hace nada.
function renderPaletteChips() {
  const chips = document.getElementById("prodPaletteChips");
  const hint = document.getElementById("paletteHint");
  const palette = (settings.colorPalette || []);
  chips.replaceChildren();
  if (!palette.length) {
    hint.textContent = "No hay colores en la paleta. Agrega colores en Configuracion → Paleta de colores estandar.";
    return;
  }
  hint.textContent = "Toca un color para agregar su variacion y subir la foto de ese color.";
  palette.forEach(pc => {
    const used = editingProdColors.some(v => v.hex === pc.hex);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.title = pc.name || pc.hex;
    chip.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;border:1px solid var(--rule);background:none;color:var(--cream-dim);cursor:pointer;font-size:12px;opacity:" + (used ? ".4" : "1");
    const dot = document.createElement("span");
    dot.style.cssText = "width:16px;height:16px;border-radius:50%;border:1px solid var(--rule);background:" + pc.hex;
    const label = document.createElement("span");
    label.textContent = pc.name || pc.hex;
    chip.append(dot, label);
    chip.disabled = used;
    chip.addEventListener("click", () => {
      if (editingProdColors.some(v => v.hex === pc.hex)) return;
      editingProdColors.push({ hex: pc.hex, image: null });
      renderColorSwatches();
    });
    chips.appendChild(chip);
  });
}

// Dibuja las variaciones elegidas: cuadrito (solo lectura) + botón subir foto +
// miniatura + quitar. La 1ª variación con foto será la foto principal.
function renderColorSwatches() {
  renderPaletteChips();
  const container = document.getElementById("prodColors");
  container.replaceChildren();
  editingProdColors.forEach((v, i) => {
    const palette = (settings.colorPalette || []);
    const name = (palette.find(p => p.hex === v.hex) || {}).name || v.hex;

    const wrap = document.createElement("div");
    wrap.className = "color-input-wrap";
    wrap.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:8px";

    const dot = document.createElement("span");
    dot.style.cssText = "width:24px;height:24px;border-radius:4px;border:1px solid var(--rule);flex-shrink:0;background:" + v.hex;

    const label = document.createElement("span");
    label.textContent = name + (i === 0 ? " (principal)" : "");
    label.style.cssText = "font-size:12px;min-width:90px";

    const thumb = document.createElement("img");
    thumb.style.cssText = "width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--rule);background:var(--charcoal-deep);" + (v.image ? "" : "display:none");
    if (v.image) thumb.src = v.image;

    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.className = "btn btn-ghost btn-sm";
    fileBtn.textContent = v.image ? "Cambiar foto" : "Subir foto";
    fileBtn.addEventListener("click", () => pickVariationPhoto(i));

    const status = document.createElement("span");
    status.dataset.varStatus = String(i);
    status.style.cssText = "font-size:11px;color:var(--gray)";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.style.cssText = "background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;margin-left:auto";
    remove.addEventListener("click", () => { editingProdColors.splice(i, 1); renderColorSwatches(); });

    wrap.append(dot, label, thumb, fileBtn, status, remove);
    container.appendChild(wrap);
  });
}
```

- [ ] **Step 3: Implementar la subida de foto por variación**

En `js/admin.js`, reemplazar el listener del input de archivo del producto
(`document.getElementById("prodImageFile").addEventListener(...)`, líneas
3058-3099) por una función `pickVariationPhoto` que crea un input file al vuelo,
recorta 3:4 y sube a Bunny, guardando la URL en la variación `i`:

```js
// Abre el selector de archivo para la variación i, recorta 3:4, sube a Bunny y
// guarda la URL en editingProdColors[i].image.
async function pickVariationPhoto(i) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.querySelector('[data-var-status="' + i + '"]');
    const setStatus = (t, color) => { if (statusEl) { statusEl.textContent = t; statusEl.style.color = color || "var(--gray)"; } };
    setStatus("Abriendo recorte...", "var(--copper-lt)");
    const blob = await openCropModal(file, CROP_RATIO.product, "el producto");
    if (!blob) { setStatus(""); return; }
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const toUpload = new File([blob], baseName + ".jpg", { type: "image/jpeg" });
    setStatus("Subiendo a Bunny CDN...", "var(--copper-lt)");
    showUploadToast("busy", "Subiendo a Bunny CDN...", Math.round(toUpload.size / 1024) + " KB · variacion");
    try {
      const cdnUrl = await uploadImageToBunny(toUpload, "products");
      if (editingProdColors[i]) editingProdColors[i].image = cdnUrl;
      setStatus("OK foto subida", "var(--copper-lt)");
      showUploadToast("ok", "Foto subida", "Foto de la variacion guardada en el CDN.");
      renderColorSwatches();
    } catch (err) {
      setStatus("ERROR " + err.message, "var(--red-lt)");
      showUploadToast("err", "Subida fallida", err.message);
    }
  });
  input.click();
}
```

- [ ] **Step 4: Eliminar los handlers viejos del input de color**

En `js/admin.js`, eliminar por completo estos tres bloques que ya no aplican
(referencian IDs que ya no existen):
- `document.getElementById("addColorBtn").addEventListener(...)` (líneas 3109-3115)
- `document.getElementById("prodColorInput").addEventListener(...)` (líneas 3117-3119)
- La función `setProductImagePreview` (líneas 3044-3056) y cualquier llamada a
  ella en `openProductDrawer`.

- [ ] **Step 5: Ajustar openProductDrawer**

En `openProductDrawer` (líneas 2977-3020):

- En la rama de edición, reemplazar:
  ```js
  setProductImagePreview(p.primaryImage || p.imageUrl || "");
  ```
  por:
  ```js
  document.getElementById("prodImage").value = p.primaryImage || p.imageUrl || "";
  ```
- Reemplazar:
  ```js
  editingProdColors = [...(p.colors || [])];
  ```
  por:
  ```js
  editingProdColors = (p.colors || []).map(c =>
    (c && typeof c === "object") ? { hex: c.hex || "", image: c.image || null }
                                 : { hex: c || "", image: null });
  ```
- En la rama de producto nuevo (`else`), después de
  `document.getElementById("prodColors").replaceChildren();` (línea 3016),
  el `renderColorSwatches()` que ya se llama al final (línea 3020) dibuja los
  chips de la paleta. Confirmar que `editingProdColors = []` ya se setea arriba
  (línea 2978).

- [ ] **Step 6: Validación y submit con primaryImage desde la 1ª variación**

En el submit del `productForm` (líneas 3147-3193):

- Reemplazar la línea de lectura de imagen:
  ```js
  var imageUrl = document.getElementById("prodImage").value.trim();
  ```
  por la derivación desde variaciones:
  ```js
  var imageUrl = (editingProdColors.find(c => c.image) || {}).image || "";
  ```
- En el array de `validateFields`, reemplazar la regla de `prodImageFile`:
  ```js
    { id: "prodImageFile", valid: imageUrl.length > 0,
      msg: "Sube una imagen para el producto. No puede ir vacio." },
  ```
  por una que valide al menos una variación con foto (apunta el error al
  contenedor de variaciones):
  ```js
    { id: "prodColors", valid: imageUrl.length > 0,
      msg: "Agrega al menos un color y sube su foto. No puede ir vacio." },
  ```
- En el objeto `data`, `colors` ya queda correcto:
  ```js
    colors: [...editingProdColors],
  ```
  (Se mantiene tal cual; ahora son objetos `{hex,image}`.)
  `primaryImage` e `imageUrl` ya usan la variable `imageUrl` derivada arriba.

- [ ] **Step 7: Verificación manual**

Run: con el sitio servido y sesión en el admin:
1. Crear producto nuevo → la sección "Variaciones de color" muestra los chips de
   la paleta. Tocar 2 chips → aparecen 2 filas de variación.
2. En cada variación, "Subir foto" → recorta 3:4 → sube → aparece la miniatura.
3. Guardar → toast OK004. (Si se intenta guardar sin ninguna foto, la validación
   bloquea con el mensaje del paso 6.)
4. Abrir `http://localhost:8000/catalogo.html` → el producto muestra la foto de
   la 1ª variación.
5. Abrir su `producto.html?id=...` → clic en el 2º cuadrito cambia la foto
   principal a la foto de esa variación (con fade); las miniaturas muestran ambas
   fotos.
6. Reabrir el producto en el admin → las variaciones y sus fotos se cargan bien.
Expected: todo lo anterior se cumple; consola sin errores.

- [ ] **Step 8: Commit**

```bash
git add admin/index.html js/admin.js
git commit -m "feat: form de producto arma variaciones de color desde la paleta con foto por variacion"
```

---

## Task 6: Form de producto — materiales (multi-select desde la lista estándar)

**Files:**
- Modify: `admin/index.html` (agregar bloque de materiales en el form de producto)
- Modify: `js/admin.js` (estado `editingProdMaterials`; render; open; submit)

- [ ] **Step 1: Agregar el HTML del bloque de materiales**

En `admin/index.html`, justo después del `<div class="form-group full">` de
"Variaciones de color" (el que termina con `<div class="color-inputs" id="prodColors"></div></div>`
de Task 5 Step 1), agregar:

```html
        <div class="form-group full">
          <label>Materiales (elige de la lista del dashboard)</label>
          <p id="materialHint" style="font-size:12px;color:var(--gray);margin:0 0 8px"></p>
          <div id="prodMaterials" style="display:flex;flex-wrap:wrap;gap:8px"></div>
        </div>
```

- [ ] **Step 2: Declarar el estado y el render de materiales (admin.js)**

En `js/admin.js`, junto a la declaración de `editingProdColors` (buscar
`let editingProdColors` / `editingProdColors = []`; está cerca del top del área
del form de producto), agregar la variable de estado:

```js
let editingProdMaterials = [];
```

Y agregar la función de render (puede ir junto a `renderColorSwatches`):

```js
// Dibuja la lista de materiales estándar (settings.materialList) como chips
// toggle. Los marcados quedan en editingProdMaterials.
function renderMaterialChips() {
  const container = document.getElementById("prodMaterials");
  const hint = document.getElementById("materialHint");
  const list = (settings.materialList || []);
  container.replaceChildren();
  if (!list.length) {
    hint.textContent = "No hay materiales. Agrega materiales en Configuracion → Materiales estandar.";
    return;
  }
  hint.textContent = "Toca los materiales de este producto (puedes elegir varios).";
  list.forEach(mat => {
    const on = editingProdMaterials.includes(mat);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = mat;
    chip.style.cssText = "padding:5px 12px;border-radius:999px;cursor:pointer;font-size:12px;border:1px solid " +
      (on ? "var(--copper)" : "var(--rule)") + ";background:" + (on ? "var(--copper)" : "none") +
      ";color:" + (on ? "var(--bg)" : "var(--cream-dim)");
    chip.addEventListener("click", () => {
      const idx = editingProdMaterials.indexOf(mat);
      if (idx === -1) editingProdMaterials.push(mat);
      else editingProdMaterials.splice(idx, 1);
      renderMaterialChips();
    });
    container.appendChild(chip);
  });
}
```

- [ ] **Step 3: Poblar materiales en openProductDrawer**

En `openProductDrawer`:
- En la rama de edición (junto a donde se setea `editingProdColors`), agregar:
  ```js
  editingProdMaterials = Array.isArray(p.materials) ? [...p.materials]
                        : (typeof p.material === "string" && p.material.trim() ? [p.material.trim()] : []);
  ```
- En la rama de producto nuevo (`else`), agregar:
  ```js
  editingProdMaterials = [];
  ```
- Al final, junto a la llamada `renderColorSwatches();` (línea 3020), agregar:
  ```js
  renderMaterialChips();
  ```

- [ ] **Step 4: Guardar materials en el submit**

En el objeto `data` del submit del `productForm`, agregar junto a `colors`:

```js
    materials: [...editingProdMaterials],
```

- [ ] **Step 5: Verificación manual**

Run: con el sitio servido y sesión en el admin:
1. Configuracion → confirmar que hay materiales en la lista estándar (si no,
   agregarlos y guardar).
2. Crear/editar un producto → la sección "Materiales" muestra los chips de la
   lista. Tocar 2 → quedan marcados.
3. Guardar → toast OK004.
4. Abrir `producto.html?id=...` → en specs aparece la fila "Material" con los 2
   materiales separados por coma.
5. Reabrir el producto en el admin → los materiales marcados se cargan bien.
Expected: todo lo anterior se cumple; consola sin errores.

- [ ] **Step 6: Commit**

```bash
git add admin/index.html js/admin.js
git commit -m "feat: form de producto elige materiales desde la lista estandar"
```

---

## Task 7: Actualizar documentación del modelo de datos

**Files:**
- Modify: `DATA-MODEL.md` (tablas `products` y `settings`)

- [ ] **Step 1: Actualizar la tabla products**

En `DATA-MODEL.md`, en la tabla de `products`, reemplazar la fila de `colors`:

```
| `colors` | array | Array of hex color codes for color swatches |
```

por:

```
| `colors` | array | Variaciones: `[{ hex, image }]` — hex de la paleta estándar + foto de esa variación. La foto de la 1ª variación se copia a `primaryImage`. |
```

y reemplazar la fila de `material`:

```
| `material` | string (optional) | e.g., "Madera", "Tapizado" |
```

por:

```
| `material` | string (optional, legacy) | Material único (formato viejo; se lee vía normalizeMaterials) |
| `materials` | array | Materiales a nivel de ítem, elegidos de `settings.materialList` |
```

- [ ] **Step 2: Actualizar la tabla settings**

En la tabla de `settings`, agregar dos filas:

```
| `colorPalette` | array | Paleta de colores estándar: `[{ hex, name }]` (name solo interno) |
| `materialList` | array | Lista de materiales estándar: `["Madera", ...]` |
```

- [ ] **Step 3: Commit**

```bash
git add DATA-MODEL.md
git commit -m "docs: modelo de datos refleja colorPalette, materialList y colors como variaciones"
```

---

## Notas de cierre

- Orden recomendado: Task 1 → 2 → 3 → 4 → 5 → 6 → 7. Tasks 1-3 son seguras y no
  cambian la base de datos; Task 4 habilita las paletas; Tasks 5-6 dependen de
  que la paleta/materiales existan (Task 4).
- No se migran documentos existentes. Cada producto se actualiza al editarlo en
  el admin (los normalizadores evitan que se rompa mientras tanto).
- Cache-buster: si al recargar el admin no se ven los cambios de JS, hacer
  Cmd+Shift+R; el import de `admin.js`/`firebase-config.js` usa `?v=...`.
