// Normalizadores de datos de producto. Hacen retrocompatibles los formatos
// viejos con los nuevos, sin migrar la base:
//   - colors como strings sueltos  -> variaciones {hex,image,images}
//   - material string unico         -> materials array
//   - 1 foto por color (image)      -> N fotos por color (images)
//   - sin hasColorVariants          -> se infiere si el producto usa color
// Funciones puras, sin dependencias — usables desde renderers y admin.
// Tests: node scripts/test-normalizers.mjs

// Agrega urls a una lista sin duplicar ni dejar vacios. Helper interno.
function pushUrl(list, url) {
  if (typeof url === "string" && url.trim() && !list.includes(url)) list.push(url);
}

// Devuelve siempre { hex, image, images }.
//  - "#8B4513"                          -> { hex:"#8B4513", image:null, images:[] }
//  - { hex, image:"a" }                 -> { hex, image:"a", images:["a"] }   (formato viejo)
//  - { hex, images:["a","b"] }          -> { hex, image:"a", images:["a","b"] }
// `image` se mantiene en la salida para no romper a ningun lector viejo.
export function normalizeColor(c) {
  if (c && typeof c === "object") {
    const images = [];
    if (Array.isArray(c.images)) c.images.forEach(u => pushUrl(images, u));
    // Formato viejo: la unica foto vivia en `image`.
    pushUrl(images, c.image);
    return { hex: c.hex || "", image: images[0] || null, images };
  }
  return { hex: c || "", image: null, images: [] };
}

// Devuelve siempre un array de strings de materiales a nivel de item.
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

// ¿Este producto se vende por color? Es la fuente de verdad para mostrar u
// ocultar los cuadritos en producto, catalogo y home.
// Si el documento no trae el flag (todo lo cargado antes del toggle), se infiere:
// tener al menos un color con hex significaba, hasta ahora, venderse por color.
export function hasColorSelection(p) {
  if (!p) return false;
  if (typeof p.hasColorVariants === "boolean") return p.hasColorVariants;
  return Array.isArray(p.colors) && p.colors.some(c => normalizeColor(c).hex);
}

// Fotos de una variacion concreta. Array vacio si ese color no tiene fotos
// (caso valido: la validacion solo exige que UNA variacion tenga foto).
export function colorImages(p, hex) {
  if (!p || !Array.isArray(p.colors)) return [];
  const match = p.colors.map(normalizeColor).find(v => v.hex && v.hex === hex);
  return match ? match.images.slice() : [];
}

// Galeria inicial del producto, segun el modo.
//  - sin color -> galeria propia (`images`)
//  - con color -> fotos de la primera variacion que tenga fotos
// En ambos casos cae a primaryImage/imageUrl si no encontro nada, para que un
// producto legacy nunca quede sin imagen (p.ej. al apagarle el toggle).
export function productGallery(p) {
  if (!p) return [];
  const out = [];

  if (hasColorSelection(p)) {
    const variants = (p.colors || []).map(normalizeColor).filter(v => v.hex);
    const first = variants.find(v => v.images.length);
    if (first) first.images.forEach(u => pushUrl(out, u));
  } else if (Array.isArray(p.images)) {
    p.images.forEach(u => pushUrl(out, u));
  }

  if (!out.length) {
    pushUrl(out, p.primaryImage);
    pushUrl(out, p.imageUrl);
  }
  return out;
}
