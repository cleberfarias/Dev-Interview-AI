import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const monitoringEnabled =
  import.meta.env.PROD || import.meta.env.VITE_ENABLE_FIREBASE_MONITORING_IN_DEV === "true";

export const analyticsPromise = monitoringEnabled
  ? isAnalyticsSupported()
      .then((ok) => (ok ? getAnalytics(app) : null))
      .catch(() => null)
  : Promise.resolve(null);

export const performancePromise = monitoringEnabled
  ? import("firebase/performance")
      .then(({ getPerformance }) => getPerformance(app))
      .catch(() => null)
  : Promise.resolve(null);
