/**
 * Firebase configuration for Mueblería Palito Outlet
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com
 * 2. Create a new project (or select existing)
 * 3. Enable Firestore Database
 * 4. Enable Storage
 * 5. Enable Authentication → Email/Password
 * 6. Register a web app in Project settings
 * 7. Copy your config keys below
 */
const firebaseConfig = {
  apiKey: "AIzaSyC7SDRkpWK9hA2Obc8Gn9jRdBitrkEK1VQ",
  authDomain: "muebleria-palito-outlet.firebaseapp.com",
  projectId: "muebleria-palito-outlet",
  storageBucket: "muebleria-palito-outlet.firebasestorage.app",
  messagingSenderId: "12468485710",
  appId: "1:12468485710:web:c39d88fb87d533096a0d1f"
};

export { firebaseConfig };

/**
 * Bunny CDN Storage Zone credentials — fill in your API key
 * Get yours: Storage Zone → FTP & API Access → API Key
 */
const BUNNY_CDN = {
  zoneName: "muebleria-palito",                       // Storage Zone name
  // Storage Zone Password — for uploads/downloads on br.storage.bunnycdn.com.
  // Bunny Dashboard → Storage Zone "muebleria-palito" → FTP & API Access → Password.
  apiKey: "63ab4787-ab96-43c4-86da7c32777c-8927-4afa",
  // Account API Key — only used to purge edge cache via api.bunny.net.
  // Optional. If empty, purge calls are skipped silently and the CDN edge
  // updates naturally within ~60 seconds after an upload.
  // To enable instant purges: Bunny Dashboard → Account Settings → API → API Key.
  accountApiKey: "",
  cdnUrl: "https://muebleria-palito-cdn.b-cdn.net",   // Public CDN URL (read, no auth)
  apiUrl: "https://br.storage.bunnycdn.com",          // Storage API endpoint (São Paulo region)
};

export { BUNNY_CDN };
