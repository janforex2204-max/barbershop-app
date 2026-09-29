"use client";

import { useEffect } from "react";

// Registrira public/sw.js (glej tam za razlago, zakaj je namenoma prazen -
// samo PWA namestljivostni pogoj, brez predpomnjenja). Ne renderja ničesar -
// samo montiran enkrat v layout.tsx, ob strani ThemeProvider.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Neusodno - stran deluje enako naprej tudi brez registriranega
        // service workerja (samo "Dodaj na domači zaslon" morda ne bo
        // ponujen v vseh brskalnikih).
      });
    }
  }, []);

  return null;
}
