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
