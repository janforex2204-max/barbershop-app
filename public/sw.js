// Minimalen service worker - SAMO za "Dodaj na domači zaslon" (PWA
// namestljivost zahteva REGISTRIRAN service worker, glej pogovor s Claude).
// Namenoma BREZ predpomnjenja/fetch prestrezanja - Fillio je live
// rezervacijski sistem (proste termine/zasedenost bere neposredno iz
// Supabase), zato bi kakršnokoli predpomnjenje odzivov tvegalo, da lastnik
// ali stranka vidi ZASTARELE podatke (npr. termin, ki je bil medtem že
// zaseden). skipWaiting/clients.claim samo poskrbita, da nova različica
// tega (praznega) workerja takoj prevzame nadzor, brez zapiranja zavihka.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
