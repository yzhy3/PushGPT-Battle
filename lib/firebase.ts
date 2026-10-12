import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAbhIPS9_SJ6SVbDg8TxffJwQzxcOqs7mE",
  authDomain: "tiktokperfil-38c8e.firebaseapp.com",
  databaseURL: "https://tiktokperfil-38c8e-default-rtdb.firebaseio.com",
  projectId: "tiktokperfil-38c8e",
  storageBucket: "tiktokperfil-38c8e.firebasestorage.app",
  messagingSenderId: "1014198546798",
  appId: "1:1014198546798:web:66581fa5420a39eee7d17f",
  measurementId: "G-BF70BMR21E",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
