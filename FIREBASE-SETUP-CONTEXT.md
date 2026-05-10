# Mueblería Palito — Firebase Setup Context
- Saved: 2026-05-10

## Firebase Project
- **Project name:** `muebleria-palito-outlet`
- **Project ID:** `muebleria-palito-outlet`
- **Project number:** `12468485710`
- **Web app ID:** `1:12468485710:web:c39d88fb87d533096a0d1f`
- **Firestore region:** `sao-paulo` (s1)
- **Auth:** Email/Password enabled

## Firebase Config (in `js/firebase-config.js`)
```js
apiKey: "AIzaSyC7SDRkpWK9hA2Obc8Gn9jRdBitrkEK1VQ"
authDomain: "muebleria-palito-outlet.firebaseapp.com"
projectId: "muebleria-palito-outlet"
storageBucket: "muebleria-palito-outlet.firebasestorage.app"
messagingSenderId: "12468485710"
appId: "1:12468485710:web:c39d88fb87d533096a0d1f"
```

## Firestore Rules (TODO: paste after login works)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
    }
    match /{document=**} {
      allow write: if request.auth != null;
    }
  }
}
```

## Collections
- `categories` — 16 docs (id: string, fields: name, imageUrl, subcategories[], featured, productCount, displayOrder, slug)
- `products` — 14 docs (fields: name, description, categoryId, primaryImage, price, originalPrice, onSale, isNew, featured, displayOrder, badge, colors[], gallery[])
- `settings` — doc `store` (fields: storeLocations[], heroSection{}, promoBanner{}, whatsappNumber, businessHours{}, socialLinks{})

## Bunny CDN
- **Storage zone ID:** 1507753
- **Storage zone name:** `muebleria-palito`
- **Pull zone ID:** 5830360
- **Pull zone hostname:** `https://muebleria-palito-cdn.b-cdn.net`
- **Storage password:** `63ab4787-ab96-43c4-86da7c32777c-8927-4afa`

## Bunny CDN Image Mapping (full in `js/bunny-cdn-map.json`)
- **Products (9):** `/products/cama-platform-oslo.jpg`, `cama-king-monarch.jpg`, `set-dormitorio-milano.jpg`, `colchon-memory-plus.jpg`, `mesa-noche-flux.jpg`, `armario-3-puertas.jpg`, `cabecera-terciopelo-vienna.jpg`, `cama-tapizada-berlin.jpg`, `comoda-doble-lund.jpg`
- **Categories (10):** `/categorias/salas.jpg`, `comedores.jpg`, `dormitorios.jpg`, `camas.jpg`, `comodas.jpg`, `coquetas.jpg`, `roperos.jpg`, `entretenimiento.jpg`, `consolas.jpg`, `bar.jpg`
- **Banners (2):** `/banners/lifestyle.jpg`, `banners/dormitorios-hero.jpg`

## Admin Panel
- **TODO:** Remove self-registration — only login with one predefined admin
- **TODO:** Seed data must load automatically, not via button
- **TODO:** Create one-time setup script to create admin user + load seed data

## Pages
- index.html → index-renderer.js (hero, categories grid, products grid, promo, about, store locations)
- categorias.html → categorias-renderer.js (hero stats, featured grid, regular grid)
- catalogo.html → catalogo-renderer.js (hero img, sidebar accordion, product grid)
