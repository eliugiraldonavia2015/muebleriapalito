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
eq(normalizeMaterials({ materials: ["", "  ", "Metel"] }), ["Metel"], "materials filtra vacíos");
eq(normalizeMaterials({}), [], "sin materiales");

if (failed) { console.error(`\n${failed} test(s) fallaron`); process.exit(1); }
console.log("\nTodos los tests pasaron");
