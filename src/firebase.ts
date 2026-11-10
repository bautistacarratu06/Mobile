import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyDqdmCFH5IKStv2DKy3KDdN-oH5qBik3YI',
  authDomain: 'mobile-ifts11.firebaseapp.com',
  projectId: 'mobile-ifts11',
  storageBucket: 'mobile-ifts11.firebasestorage.app',
  messagingSenderId: '520340530638',
  appId: '1:520340530638:web:bf985ce6694eb925d1779f',
  measurementId: 'G-2GDQGEX267',
};

export const app: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const db: Firestore = getFirestore(app);
