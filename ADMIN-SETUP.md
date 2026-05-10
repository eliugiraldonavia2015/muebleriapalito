# Firebase Admin Panel Setup — Muebleria Palito Outlet

## What You Get

A complete admin panel at `/admin/index.html` that lets you manage:
- **16 furniture categories** — name, image, subcategories, homepage visibility
- **14 products** — name, price, images, featured/sale status, colors
- **Site settings** — contact info, social links, hero section, promo banner, store locations

All data is stored in **Firestore** and the panel requires **Firebase Auth** to access.

---

## Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Create project** → Name it "Muebleria Palito" (or whatever)
3. Disable Google Analytics (not needed for this setup)
4. Once created, click the **</> (Web)** icon to register a web app
5. Name your app "Palito Admin" and copy the config object — it looks like:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc123"
};
```

---

## Step 2 — Enable Firestore

1. In the Firebase Console, go to **Firestore Database** in the left nav
2. Click **Create database**
3. Choose **Start in test mode** (we'll lock it down later)
4. Select a region close to you (e.g., `nam5` for US)
5. Click **Enable**

---

## Step 3 — Enable Authentication

1. Go to **Authentication** in the left menu
2. Click **Get started**
3. Enable **Email/Password** as a sign-in method
4. Click **Save**

---

## Step 4 — Fill in Your Firebase Config

Open `js/firebase-config.js` and replace the placeholder config with your real values:

```js
export const firebaseConfig = {
  apiKey: "YOUR_REAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc123"
};
```

---

## Step 5 — Serve the Project Locally

Because the admin panel uses ES module imports from Firebase CDN, it **must be served via HTTP** — not opened directly as a file.

Pick one:

```bash
# Python (comes pre-installed on most Macs/Linux)
cd /Users/eliugiraldo/Downloads/muebleriapalito
python3 -m http.server 3000
```

```bash
# Node.js (if you have it installed)
npx serve -l 3000    # or: npx http-server -p 3000
```

Then visit: `http://localhost:3000/admin/index.html`

---

## Step 6 — Create Your Admin Account

1. Go to `http://localhost:3000/admin/index.html`
2. Enter the email and password you want for the admin account
3. Click **Sign in**
4. Since no account exists yet, the app will **auto-create** the account on first login
5. Verify the account in Firebase Console → **Authentication** → **Users**

---

## Step 7 — Seed Your Data

1. Once logged in, look at the sidebar and click **Cargar datos iniciales**
2. Hit the button **Cargar todo**
3. Wait for the success message ✅
4. This will populate Firestore with:
   - 16 categories
   - 14 products
   - Full site settings (contact, hours, social links, banner, hero)

---

## Step 8 — Secure Your Database (Production)

Go to **Firestore** → **Rules** tab and set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Categories: public read, authenticated write
    match /categories/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // Products: public read, authenticated write
    match /products/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    // Settings: public read, authenticated write
    match /settings/{id} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## File Structure

```
muebleriapalito/
├── admin/
│   └── index.html          ← Admin panel UI (login + CRUD dashboard)
├── js/
│   ├── firebase-config.js  ← Firebase credentials (FILL THIS IN)
│   ├── catalog-data.js     ← Data access helpers (for public pages)
│   ├── admin.js            ← Admin panel logic (auth, CRUD, seed)
│   └── seed-data.js        ← Pre-populated catalog data module
├── DATA-MODEL.md           ← Firestore schema documentation
├── ADMIN-SETUP.md          ← You are here
├── catalog-data.json       ← Extracted raw data (JSON format)
├── index.html              ← Homepage (will be updated to use Firestore)
├── categorias.html         ← Categories page (will be updated to use Firestore)
└── catalogo.html           ← Product catalog (will be updated to use Firestore)
```

---

## How Admin CRUD Works

| Action | What Happens |
|--------|-------------|
| **Add Category** | Opens modal → fill name, imageUrl, subcategories, homepage toggle → saves to Firestore |
| **Edit Category** | Pre-fills modal with existing → on save, updates Firestore document |
| **Delete Category** | Shows confirmation → permanently removes from Firestore |
| **Homepage Toggle** | One-click toggle in table → immediately updates Firestore |
| **Add Product** | Opens form → pick category, set name/price/images → saves to Firestore |
| **Edit Product** | Pre-fills form with current data → save updates Firestore |
| **Delete Product** | Confirmation → removes from Firestore |
| **Settings** | Single form with sections → saves to `settings/store` document with merge |
| **Seed Data** | Batch writes all 16 categories + 14 products + settings in one transaction |

---

## Troubleshooting

### "Nothing loads / No data showing"
- Check `js/firebase-config.js` has real credentials (not placeholders)
- Open the browser console (F12) and look for error messages
- Make sure you're serving via HTTP, not opening the HTML file directly

### "auth/operation-not-allowed" 
- Go to Firebase Console → Authentication → Sign-in method → Enable **Email/Password**

### "permission-denied" on Firestore
- Go to Firestore → Rules → make sure you have `allow read: if true;` and `allow write: if request.auth != null;` (see Step 8)

### "CORS error / CDN not loading"
- The Firebase SDK loads from `gstatic.com` CDN. This should work on any HTTP server.
- If blocked by firewall or network, try a different server or local network

### "Seed button fails"
- Check that seed-data.js exists in `js/seed-data.js`
- Verify Firestore is created and active
- Try clearing Firestore docs and re-seed

---

## Next Steps

After the admin panel works:
1. The public pages (`index.html`, `categorias.html`, `catalogo.html`) will be wired up to render from Firestore
2. You'll manage everything from the admin panel — no more HTML editing needed
3. Consider setting up **Firebase Hosting** for free static hosting with HTTPS
