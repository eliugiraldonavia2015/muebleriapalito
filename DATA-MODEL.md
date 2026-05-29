# Firestore Data Model — Mueblería Palito Outlet

## Collections

### `categories`
| Field | Type | Description |
|---|---|---|
| `name` | string | Display name (e.g., "Salas") |
| `slug` | string | URL-safe identifier (e.g., "Salas") |
| `coverImage` | string | Hero image URL for the category |
| `subcategoryList` | array | List of objects: `{ name: string, slug: string }` |
| `showOnHomepage` | boolean | Whether this category appears on the home screen |
| `displayOrder` | number | Sort order on homepage (lower = first) |
| `productCount` | number | Displayed count of products |
| `hasSubcategories` | boolean | If true, renders with sub-pills on categories page |
| `createdAt` | timestamp | — |
| `updatedAt` | timestamp | — |

**Firestore Indexes:** Compound on `showOnHomepage + displayOrder`

---

### `products`
| Field | Type | Description |
|---|---|---|
| `name` | string | Product name (e.g., "Sala Modular Chester") |
| `description` | string | Short description |
| `categoryId` | string (ref) | Category slug this product belongs to |
| `subcategory` | string (optional) | e.g., "Grandes", "2 Plazas" |
| `primaryImage` | string | Main product image URL |
| `gallery` | array | Additional image URLs |
| `price` | number | Current price |
| `originalPrice` | number (optional) | For showing crossed-out original when on sale |
| `onSale` | boolean | If true, shows discount badge |
| `isNew` | boolean | If true, shows "Nuevo" badge |
| `featured` | boolean | If true, appears in homepage featured carousel |
| `displayOrder` | number | Sort order within category |
| `badge` | string (optional) | Custom badge text (overrides onSale/isNew badge) |
| `colors` | array | Variaciones: `[{ hex, image }]` — hex de la paleta estándar + foto de esa variación. La foto de la 1ª variación se copia a `primaryImage`. |
| `material` | string (optional, legacy) | Material único (formato viejo; se lee vía normalizeMaterials) |
| `materials` | array | Materiales a nivel de ítem, elegidos de `settings.materialList` |
| `qrUrl` | string (optional) | URL para generar un QR; si existe, se muestra el QR en la página de producto (bajo las miniaturas) |
| `available` | boolean | If false, hidden from catalog |
| `createdAt` | timestamp | — |
| `updatedAt` | timestamp | — |

**Firestore Indexes:** Compound on `categoryId + displayOrder`, Compound on `featured + displayOrder`

---

### `settings` (single document `store`)
| Field | Type | Description |
|---|---|---|
| `whatsappNumber` | string | Number in format expected by wa.me |
| `whatsappPhoneDisplay` | string | Display format (e.g., "095 862 7206") |
| `email` | string | Contact email |
| `phoneLine` | string | Toll-free or direct line |
| `businessHours` | object | `{ weekdays: str, saturday: str, sunday: str }` |
| `socialLinks` | object | `{ facebook: url, instagram: url, tiktok: url }` |
| `storeLocations` | array | Array of `{ country, city, address, hours, phone, isFlagship }` |
| `paymentMethods` | array | e.g., ["visa", "mastercard", "paypal"] |
| `promoBanner` | object | `{ image: url, title: str, subtitle: str, ctaUrl: str, discountPct: number, discountText: str }` |
| `heroSection` | object | `{ subtitle: str, title: str, emWord: str, description: str, bgImage: url }` |
| `siteStats` | object | `{ categories: str, products: str, countries: str }` |
| `newsletter` | object | `{ title: str, subtitle: str }` |
| `footer` | object | `{ tagline: str }` |
| `colorPalette` | array | Paleta de colores estándar: `[{ hex, name }]` (name solo interno) |
| `materialList` | array | Lista de materiales estándar: `["Madera", ...]` |

---

## File Structure

```
muebleriapalito/
├── index.html                 # Homepage (reads from Firestore)
├── categorias.html            # Categories page (reads from Firestore)
├── catalogo.html              # Category products page (reads from Firestore)
├── contacto.html
├── nosotros.html
├── logo.png
├── catalog-data.json          # Seed / backup data
├── DATA-MODEL.md              # This file
├── ADMIN-SETUP.md             # Admin panel instructions
├── js/
│   ├── firebase-config.js     # Firebase initialization config
│   ├── catalog-data.js        # Shared data access + rendering helpers
│   └── admin.js               # Admin panel CRUD logic
└── admin/
    └── index.html             # Admin panel (email + password auth)
```

---

## Security Rules (for Firestore)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Everyone can READ data
    match /categories/{catId} {
      allow read: if true;
    }
    match /products/{productId} {
      allow read: if true;
    }
    match /settings/{docId} {
      allow read: if true;
    }

    // Only authenticated admin can WRITE
    match /categories/{catId} {
      allow write: if request.auth != null;
    }
    match /products/{productId} {
      allow write: if request.auth != null;
    }
    match /settings/{docId} {
      allow write: if request.auth != null;
    }
  }
}
```
