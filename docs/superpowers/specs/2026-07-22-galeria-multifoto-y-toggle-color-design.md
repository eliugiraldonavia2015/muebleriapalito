# Diseño: toggle de venta por color + varias fotos por color (galería deslizable)

**Fecha:** 2026-07-22
**Estado:** Aprobado
**Antecede:** [2026-05-28 — Colores y materiales estándar + foto por variación](./2026-05-28-foto-por-color-design.md)

## Objetivo

1. **Toggle por producto.** Un interruptor decide si el ítem se vende por color.
   Apagado, el cliente **no ve selector de color en ninguna parte** — ni los
   cuadritos de la página de producto ni los puntitos del catálogo y el home. No
   es "ve un solo color": es que la elección no existe.
2. **Varias fotos por color.** Cada variación pasa de 1 foto a N. El usuario
   final se desliza entre ellas.
3. **Fotos sin color.** Con el toggle apagado, el producto tiene su propia
   galería, sin color asociado.

Todo esto **sin migrar ni tocar los documentos que ya están en producción**.

## Restricción que manda: no dañar los datos vivos

La base ya tiene productos cargados y la página está publicada. El diseño se
somete a esa restricción:

- **No se ejecuta ningún script de migración.** Nada escribe en Firestore fuera
  del guardado normal del admin.
- **Todos los campos nuevos son opcionales.** Su ausencia se resuelve al leer.
- **Un producto viejo se ve exactamente igual que hoy.** Ver "Regla de
  inferencia" y "Por qué no hay regresión".
- Los documentos adoptan el formato nuevo solos, cuando Alex los edite — misma
  política que el spec de mayo (ver su línea 67).

## Modelo de datos

### `products` — tres campos nuevos, todos opcionales

| Campo | Tipo | Descripción |
|---|---|---|
| `hasColorVariants` | bool | El toggle. `true` = se vende por color |
| `colors[].images` | array | Fotos de esa variación, en orden. La 1ª es la principal de ese color |
| `images` | array | Galería del producto cuando `hasColorVariants` es `false` |

Se conservan sin cambio de significado: `colors[].hex`, `colors[].image`,
`materials`, `primaryImage`, `imageUrl`.

### Regla de inferencia (el corazón de la compatibilidad)

Si `hasColorVariants` **no existe** en el documento, se infiere:

> ¿tiene `colors` con al menos un `hex`? → `true`. Si no → `false`.

Como la validación de mayo ya exigía mínimo un color con foto, **todo producto
existente infiere `true`** y conserva su comportamiento actual.

### Compatibilidad de las fotos

- `colors[].images` ausente → se deriva `[colors[].image]` (o `[]` si no hay).
- Al guardar se escribe **`image = images[0]`**, así cualquier lector viejo del
  campo `image` sigue funcionando sin enterarse.
- `images` a nivel de producto ya existía como campo legacy y ya se leía en
  `producto-renderer.js:828`; ahora pasa a ser la galería oficial del modo sin
  color. No se inventa estructura nueva.

### Por qué no hay regresión

Un producto viejo tiene 1 foto por color. Su galería queda de 1 sola foto, y con
una sola foto **no se dibujan flechas ni puntitos**. Resultado en pantalla:
idéntico a hoy — una imagen a panel completo que cambia al tocar un color.

## Componentes

### 1. `js/product-normalizers.js` — funciones puras, con tests

Es la única pieza que sabe interpretar los formatos viejo y nuevo. Renderers y
admin preguntan acá en lugar de armar listas por su cuenta.

| Función | Devuelve |
|---|---|
| `normalizeColor(c)` | `{ hex, image, images }` — `images` siempre array |
| `normalizeMaterials(p)` | array de materiales (sin cambios) |
| `hasColorSelection(p)` | bool — flag explícito, o la inferencia |
| `colorImages(p, hex)` | fotos de esa variación (`[]` si no tiene) |
| `productGallery(p)` | galería inicial, según el modo |

`productGallery(p)`:
- modo sin color → `images`, y si está vacío cae a `primaryImage`/`imageUrl`
  (protege a un producto legacy al que se le apague el toggle);
- modo con color → fotos de la primera variación que tenga fotos, con la misma
  red de seguridad.

Ambas dedupean por URL.

### 2. Admin — `admin/index.html` + `js/admin.js`

**El toggle.** Switch "Este producto se vende por color", reusando el
componente `.toggle` que ya existe (`admin/index.html:150-155`, el mismo de
"Destacado" y "Nuevo"). Se coloca encima del bloque de variaciones porque es su
interruptor. Producto nuevo arranca **encendido**, para que el flujo se sienta
igual al de hoy.

- Encendido → se ven los chips de la paleta y las filas de variación.
- Apagado → se ve un único bloque "Fotos del producto".

**El toggle nunca borra.** Apagarlo conserva `colors` en el documento;
encenderlo conserva `images`. Se puede ir y volver sin perder trabajo. Además,
al apagarlo, si la galería está vacía y las variaciones tenían fotos, esas
fotos se **copian** (no se mueven) a la galería, para que el ítem nunca quede
sin imagen por un clic.

**Varias fotos.** Tanto las filas de variación como la galería del producto
muestran una tira de miniaturas con:
- `+ Agregar foto` — admite **elegir varios archivos de una vez**; el recorte
  3:4 corre en fila con contador "Foto 2 de 5";
- `×` para quitar una foto;
- `◂ ▸` para reordenar. La primera es la principal.

Sin drag-and-drop y sin librerías nuevas.

**Validación**, adaptada al modo:
- encendido → al menos una variación con al menos una foto;
- apagado → al menos una foto en la galería.

**Resiliencia a HTML cacheado.** `ensureProductVariationUI()` ya inyecta los
bloques que falten si el navegador sirve un `admin/index.html` viejo
(`js/admin.js:3254-3257`). Se extiende con el toggle y la galería, manteniéndola
idempotente.

**Al guardar:**
```
hasColorVariants = <toggle>
colors  = [{ hex, image: images[0], images: [...] }]
images  = [...]                       // galería del modo sin color
primaryImage = imageUrl = productGallery(doc)[0]
```

### 3. Página de producto — `producto.html` + `js/producto-renderer.js`

Galería dentro de `.main-img-wrap`, respetando la decisión de mayo de que la
foto ocupe todo el panel (`#thumb-strip` sigue oculto, no se toca):

- **swipe** con eventos de puntero — sirve para dedo y para mouse;
- **flechas `‹ ›`** que aparecen al pasar el mouse;
- **puntitos** abajo indicando cuántas fotos hay.

Con una sola foto no se dibuja ni flechas ni puntitos.

Al tocar un color se cambia la galería a las fotos de ese color y se vuelve a la
primera. Si ese color no tiene fotos, la galería no cambia — mismo criterio que
hoy (`buildColors` hace `if (!c.image) return`).

`#prod-colors-wrap` se oculta cuando `hasColorSelection(p)` es `false`.

**Convivencia con la lupa.** La lupa sigue al puntero en escritorio y pelearía
con el arrastre. Se resuelve con umbral: el arrastre solo empieza pasados unos
píxeles y, mientras se arrastra, la lupa se apaga. `initLoupe` **no** se vuelve
a llamar (agrega listeners en cada llamada); la galería actualiza el
`background-image` de la lupa directamente, como ya hace `buildColors`.

### 4. Catálogo y home — `catalogo-renderer.js:80`, `index-renderer.js:433`

Hoy los puntitos de color se dibujan siempre que haya `colors`. Se condicionan a
`hasColorSelection(p)` para que un producto sin color no muestre puntitos en
ningún listado.

## El riesgo de la caché

En cache-hit la página se popula desde `localStorage`/IndexedDB y **salta el
re-render** para no duplicar listeners (`producto-renderer.js:880-934`). Un
visitante que ya estuvo en el sitio tiene guardado el producto viejo y no vería
la galería nueva.

Degrada sin romperse (muestra una foto), pero se resuelve con el patrón que ya
se usó para las especificaciones en el commit `ffbba19`: cuando llega el dato
fresco de Firestore, se **re-renderiza solo la galería y los cuadritos de
color** si cambiaron, sin volver a montar la página ni re-registrar listeners.

## Casos borde

| Caso | Comportamiento |
|---|---|
| Producto viejo (1 foto por color, sin flag) | Infiere modo color; galería de 1 foto; se ve igual que hoy |
| Variación sin fotos | El cuadrito se muestra; al tocarlo la galería no cambia |
| Toggle apagado con galería vacía | Se copian las fotos de las variaciones al apagar |
| Toggle encendido sin variaciones | La validación pide agregar un color con foto |
| Color borrado de la paleta luego de usarse | Igual que hoy: el ítem conserva su `{hex, images}` |
| Subida a Bunny falla en 1 de N fotos | Las demás se guardan; se avisa cuál falló |
| Producto sin ninguna foto | La validación impide guardar |

## Pruebas

- **Automáticas:** se extiende `scripts/test-normalizers.mjs` (`node
  scripts/test-normalizers.mjs`) con los formatos viejo y nuevo: color string,
  color objeto sin `images`, producto sin flag, producto sin colores, galería
  con duplicados.
- **Manual:** producto viejo intacto; apagar y encender el toggle sin perder
  fotos; guardar sin fotos bloqueado; varias fotos por color; swipe en móvil y
  en escritorio; puntitos ausentes en catálogo para un producto sin color.

## Fuera de alcance (YAGNI)

- Precio o stock por color.
- Nombre del color visible al cliente.
- Video dentro de la galería.
- Reordenar variaciones entre sí (sí se reordenan las fotos dentro de una).
- Migración masiva de documentos.
