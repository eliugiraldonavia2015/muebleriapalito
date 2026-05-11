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
  zoneName: "muebleria-palito-cdn",                  // Storage Zone name
  apiKey: "0338fa2d-9cce-4b31-b445-93b9ab9842f101f9e23d-cb07-4562-99d8-695bdd10806b", // Bunny Account API Access Key
  cdnUrl: "https://muebleria-palito-cdn.b-cdn.net",   // Public CDN URL
  apiUrl: "https://br.storage.bunnycdn.com",           // Storage API endpoint (São Paulo region)
};

export { BUNNY_CDN };
