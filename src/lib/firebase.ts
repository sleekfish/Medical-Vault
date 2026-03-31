import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Import Firestore

const firebaseConfig = {
    apiKey: "AIzaSyAy36qJkb7MP5mdgBV4f46vF_nLcoWU0oM",
    authDomain: "med-vault-8375b.firebaseapp.com",
    projectId: "med-vault-8375b",
    storageBucket: "med-vault-8375b.firebasestorage.app",
    messagingSenderId: "961526135811",
    appId: "1:961526135811:web:e738ae7ba485a9390e6236"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and export it
export const db = getFirestore(app);