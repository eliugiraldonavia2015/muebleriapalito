import {
  normalizeColor, normalizeMaterials,
  hasColorSelection, colorImages, productGallery,
} from "../js/product-normalizers.js";

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}: got ${a}, want ${e}`); failed++; }
  else { console.log(`ok   ${label}`); }
}

// ─── normalizeColor ───
eq(normalizeColor("#8B4513"), { hex: "#8B4513", image: null, images: [] }, "color string");
eq(normalizeColor({ hex: "#000", image: "u" }), { hex: "#000", image: "u", images: ["u"] }, "color objeto (1 foto, formato viejo)");
eq(normalizeColor({ hex: "#000" }), { hex: "#000", image: null, images: [] }, "color objeto sin image");
eq(normalizeColor(null), { hex: "", image: null, images: [] }, "color null");
eq(normalizeColor({ hex: "#000", images: ["a", "b"] }), { hex: "#000", image: "a", images: ["a", "b"] }, "color varias fotos");
eq(normalizeColor({ hex: "#000", image: "a", images: ["a", "b"] }), { hex: "#000", image: "a", images: ["a", "b"] }, "images manda, image no duplica");
eq(normalizeColor({ hex: "#000", image: "z", images: ["a"] }), { hex: "#000", image: "a", images: ["a", "z"] }, "image legacy se conserva al final");
eq(normalizeColor({ hex: "#000", images: ["a", "", "  ", "a", "b"] }), { hex: "#000", image: "a", images: ["a", "b"] }, "filtra vacios y duplicados");

// ─── normalizeMaterials ───
eq(normalizeMaterials({ materials: ["Madera", "Metal"] }), ["Madera", "Metal"], "materials array");
eq(normalizeMaterials({ material: "Madera" }), ["Madera"], "material único");
eq(normalizeMaterials({ materials: ["", "  ", "Metel"] }), ["Metel"], "materials filtra vacíos");
eq(normalizeMaterials({}), [], "sin materiales");

// ─── hasColorSelection ───
// Lo critico: los productos que YA estan en produccion no traen el flag y deben
// seguir mostrando color exactamente como hoy.
eq(hasColorSelection({ colors: [{ hex: "#000", image: "a" }] }), true, "legacy con color -> infiere true");
eq(hasColorSelection({ colors: ["#8B4513"] }), true, "legacy colors string -> infiere true");
eq(hasColorSelection({ colors: [] }), false, "sin colores -> false");
eq(hasColorSelection({}), false, "documento vacio -> false");
eq(hasColorSelection(null), false, "null -> false");
eq(hasColorSelection({ hasColorVariants: false, colors: [{ hex: "#000", image: "a" }] }), false, "flag apagado gana sobre los colores");
eq(hasColorSelection({ hasColorVariants: true, colors: [] }), true, "flag encendido gana");

// ─── colorImages ───
const prodColor = { colors: [
  { hex: "#000", images: ["n1", "n2"] },
  { hex: "#fff", image: "b1" },
  { hex: "#ccc" },
] };
eq(colorImages(prodColor, "#000"), ["n1", "n2"], "fotos de la variacion elegida");
eq(colorImages(prodColor, "#fff"), ["b1"], "variacion en formato viejo");
eq(colorImages(prodColor, "#ccc"), [], "variacion sin fotos");
eq(colorImages(prodColor, "#zzz"), [], "hex inexistente");
eq(colorImages({}, "#000"), [], "producto sin colors");

// ─── productGallery ───
eq(productGallery(prodColor), ["n1", "n2"], "galeria = 1a variacion con fotos");
eq(productGallery({ colors: [{ hex: "#000", image: "a" }] }), ["a"], "legacy 1 foto -> galeria de 1 (sin flechas ni puntitos)");
eq(productGallery({ hasColorVariants: false, images: ["g1", "g2"] }), ["g1", "g2"], "modo sin color usa images");
eq(productGallery({ hasColorVariants: false, images: [], primaryImage: "p" }), ["p"], "sin color y sin galeria cae a primaryImage");
eq(productGallery({ hasColorVariants: false, primaryImage: "p", imageUrl: "p" }), ["p"], "primaryImage e imageUrl iguales no duplican");
eq(productGallery({ hasColorVariants: true, colors: [{ hex: "#000" }], primaryImage: "p" }), ["p"], "con color pero sin fotos cae a primaryImage");
eq(productGallery({ hasColorVariants: false, images: ["g1", "g1", ""] }), ["g1"], "galeria dedupea y filtra vacios");
eq(productGallery({}), [], "producto vacio -> galeria vacia");
eq(productGallery(null), [], "null -> galeria vacia");

if (failed) { console.error(`\n${failed} test(s) fallaron`); process.exit(1); }
console.log("\nTodos los tests pasaron");
