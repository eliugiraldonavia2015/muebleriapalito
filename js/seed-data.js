function parsePrice(raw) {
  if (raw == null) return null;
  return Number(String(raw).replace(/[$,]/g, ''));
}

function createSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

/* ---------- CATEGORIES ---------- */

const CDN = "https://muebleria-palito-cdn.b-cdn.net";

export const CATEGORIES = [
  {
    id: "Salas",
    name: "Salas",
    imageUrl: `${CDN}/categorias/salas.jpg`,
    subcategories: ["Grandes", "Medianas", "Pequenas"],
    featured: true,
    productCount: 48,
    displayOrder: 0,
  },
  {
    id: "Comedores",
    name: "Comedores",
    imageUrl: `${CDN}/categorias/comedores.jpg`,
    subcategories: ["4 Puestos", "6 Puestos", "8 Puestos"],
    featured: true,
    productCount: 32,
    displayOrder: 1,
  },
  {
    id: "Dormitorios",
    name: "Dormitorios",
    imageUrl: `${CDN}/categorias/dormitorios.jpg`,
    subcategories: ["1.5 Plz", "2 Plz", "2.5 Plz", "3 Plz"],
    featured: true,
    productCount: 56,
    displayOrder: 2,
  },
  {
    id: "Camas",
    name: "Camas",
    imageUrl: `${CDN}/categorias/camas.jpg`,
    subcategories: ["1.5 Plz", "2 Plz", "2.5 Plz", "3 Plz"],
    featured: true,
    productCount: 44,
    displayOrder: 3,
  },
  {
    id: "Comodas",
    name: "Comodas",
    imageUrl: `${CDN}/categorias/comodas.jpg`,
    subcategories: [],
    featured: false,
    productCount: 18,
    displayOrder: 4,
  },
  {
    id: "Coquetas",
    name: "Coquetas / Peinadoras",
    imageUrl: `${CDN}/categorias/coquetas.jpg`,
    subcategories: [],
    featured: false,
    productCount: 12,
    displayOrder: 5,
  },
  {
    id: "CamaCuna",
    name: "Cama Cuna",
    imageUrl: `${CDN}/categorias/camacuna.jpg`,
    subcategories: [],
    featured: false,
    productCount: 8,
    displayOrder: 6,
  },
  {
    id: "Roperos",
    name: "Roperos",
    imageUrl: `${CDN}/categorias/roperos.jpg`,
    subcategories: [],
    featured: false,
    productCount: 24,
    displayOrder: 7,
  },
  {
    id: "Entretenimiento",
    name: "Centro de Entretenimiento",
    imageUrl: `${CDN}/categorias/entretenimiento.jpg`,
    subcategories: [],
    featured: false,
    productCount: 28,
    displayOrder: 8,
  },
  {
    id: "BasesTv",
    name: "Bases de TV",
    imageUrl: `${CDN}/categorias/basesTv.jpg`,
    subcategories: [],
    featured: false,
    productCount: 15,
    displayOrder: 9,
  },
  {
    id: "Consolas",
    name: "Consolas / Recibidor",
    imageUrl: `${CDN}/categorias/consolas.jpg`,
    subcategories: [],
    featured: false,
    productCount: 11,
    displayOrder: 10,
  },
  {
    id: "Bar",
    name: "Bar",
    imageUrl: `${CDN}/categorias/bar.jpg`,
    subcategories: [],
    featured: false,
    productCount: 19,
    displayOrder: 11,
  },
  {
    id: "Bufetera",
    name: "Bufetera",
    imageUrl: `${CDN}/categorias/bufetera.jpg`,
    subcategories: [],
    featured: false,
    productCount: 9,
    displayOrder: 12,
  },
  {
    id: "Aparador",
    name: "Aparador",
    imageUrl: `${CDN}/categorias/aparador.jpg`,
    subcategories: [],
    featured: false,
    productCount: 14,
    displayOrder: 13,
  },
  {
    id: "Escritorios",
    name: "Escritorios",
    imageUrl: `${CDN}/categorias/escritorios.jpg`,
    subcategories: [],
    featured: false,
    productCount: 22,
    displayOrder: 14,
  },
  {
    id: "SofaCama",
    name: "Sofa Cama",
    imageUrl: `${CDN}/categorias/sofacama.jpg`,
    subcategories: [],
    featured: false,
    productCount: 16,
    displayOrder: 15,
  },
];

/* ---------- PRODUCTS ---------- */
// No mock products. Real catalog lives in Firestore and is managed entirely
// from the admin panel (Categorias → Agregar producto). Empty array kept so
// any consumer importing PRODUCTS doesn't crash.
export const PRODUCTS = [];

/* ---------- SETTINGS ---------- */

function buildStoreLocations() {
  const locations = [];

  const raw = {
    ecuador: [
      { city: "Guayaquil", tag: "Flagship", address: "Av. Francisco de Orellana y Justino Cornejo, CC. Policentro, Local 142", hours: "Lun–Sab 9:00–21:00 · Dom 10:00–18:00", phone: "04 268 1234" },
      { city: "Quito Norte", tag: null, address: "Av. Naciones Unidas E3-71 y Shyris, CC. Quicentro Shopping, L2-34", hours: "Lun–Sab 10:00–20:00 · Dom 10:00–17:00", phone: "02 246 5678" },
      { city: "Quito Sur", tag: null, address: "Av. Morán Valverde N65-48 y Rodrigo de Chavez, CC. El Recreo", hours: "Lun–Sab 10:00–20:00 · Dom 11:00–16:00", phone: "02 334 9012" },
      { city: "Cuenca", tag: null, address: "Av. Ordonez Lasso y Carlos Arizaga, CC. Milenium Plaza, L. 88", hours: "Lun–Sab 9:30–19:30 · Dom 10:00–15:00", phone: "07 285 3456" },
      { city: "Ambato", tag: null, address: "Av. Cevallos 1435 y Mera, CC. Caracol, Planta Baja", hours: "Lun–Sab 9:00–19:00", phone: "03 242 7890" },
      { city: "Manta", tag: null, address: "Av. 4 de Noviembre y Calle 24, CC. Paseo Shopping Manta", hours: "Lun–Sab 10:00–20:00 · Dom 10:00–16:00", phone: "05 292 1234" },
    ],
    panama: [
      { city: "Panama City", tag: "Flagship", address: "Via Espana 99, CC. Multiplaza Pacific, Local 2-18", hours: "Lun–Sab 10:00–21:00 · Dom 11:00–19:00", phone: "+507 390 1234" },
      { city: "San Miguelito", tag: null, address: "Av. Ricardo J. Alfaro, CC. Metromall, Local B-24", hours: "Lun–Sab 10:00–20:00", phone: "+507 260 5678" },
      { city: "David", tag: null, address: "Av. Francisco Clark, CC. Chiriqui Mall, Piso 1", hours: "Lun–Sab 10:00–20:00 · Dom 11:00–18:00", phone: "+507 774 3456" },
    ],
    peru: [
      { city: "Lima Miraflores", tag: "Flagship", address: "Av. Larco 1150, CC. Larcomar, Tienda 34", hours: "Lun–Dom 10:00–22:00", phone: "+51 1 445 7890" },
      { city: "Lima San Isidro", tag: null, address: "Calle Las Begonias 475, CC. El Polo, Tienda 18", hours: "Lun–Sab 10:00–21:00 · Dom 11:00–18:00", phone: "+51 1 222 3456" },
      { city: "Arequipa", tag: null, address: "Av. Ejercito 793, CC. Arequipa Center, L. 52", hours: "Lun–Sab 9:30–20:00 · Dom 10:00–16:00", phone: "+51 54 285 678" },
    ],
  };

  for (const [country, stores] of Object.entries(raw)) {
    for (const s of stores) {
      locations.push({
        country,
        city: s.city,
        address: s.address,
        hours: s.hours,
        phone: s.phone,
        isFlagship: s.tag === "Flagship",
      });
    }
  }

  return locations;
}

export const SETTINGS = {
  storeLocations: buildStoreLocations(),

  heroSection: {
    eyebrow: "Coleccion 2025",
    title: "Espacios que hablan de ti",
    description: "Muebles de autor para quienes entienden que cada rincon del hogar es una declaracion de caracter.",
    bgImage: `${CDN}/banners/lifestyle.jpg`,
  },

  promoBanner: {
    title: "Accede a Crédito Directo",
    subtitle: "Divide tus compras hasta en 12 meses sin intereses. Y si prefieres pagar en efectivo, disfruta de hasta 30% de descuento en categorias y productos seleccionados.",
    discountPct: 12,
    discountText: "12 MESES SIN INTERESES",
    ctaText: "Consultar financiamiento",
    image: `${CDN}/banners/dormitorios-hero.jpg`,
  },

  whatsappNumber: "593959667093",
  whatsappPhoneDisplay: "098 966 7093",
  phoneLine: "1800 123 456",
  email: "info@palito.com",

  businessHours: {
    weekdays: "8:00 — 20:00",
    saturday: "9:00 — 18:00",
    sunday: "10:00 — 15:00",
  },

  socialLinks: {
    facebook: "https://facebook.com/muebleriapalito",
    instagram: "https://instagram.com/muebleriapalito",
    youtube: "https://youtube.com/@muebleriapalito",
    whatsapp: "https://wa.me/593959667093?text=ESTOY%20INTERESADO%20EN%20MUEBLERIA%20PALITO%20PARA%20COMPRAR%20UN%20MUEBLE%2C%20ME%20PODRIAN%20ASESORAR%3F%20VENGO%20DE%20LA%20PAGINA",
  },
};

/* ---------- AGGREGATED EXPORT ---------- */

export const CATALOG_DATA = {
  categories: CATEGORIES,
  products: PRODUCTS,
  settings: SETTINGS,
};
