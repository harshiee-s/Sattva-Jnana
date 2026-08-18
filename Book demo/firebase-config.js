// ============================================================
// FIREBASE CONFIG
// -------------------------------------------------------------
// Kept in its own file so it isn't inlined in the page HTML.
//
// IMPORTANT: this config (including "apiKey") is not a secret.
// Firebase web API keys only identify which project your app
// talks to — they do not grant access on their own. Real access
// control is enforced by your Firestore Security Rules (in the
// Firebase console, under Firestore Database → Rules). Make sure
// those rules only allow what you intend (e.g. public "create"
// on the leads collection, but no public "read"/"list"/"update"/
// "delete") — that is what actually keeps this data safe, not
// hiding this file.
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyB1CiVhD2DgupU-_9oDeRFb41SXnXt8tl4",
  authDomain: "sattva-jnana.firebaseapp.com",
  projectId: "sattva-jnana",
  storageBucket: "sattva-jnana.firebasestorage.app",
  messagingSenderId: "801759229222",
  appId: "1:801759229222:web:788f92b6f036aae836fde7"
};
