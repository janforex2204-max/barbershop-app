"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 30_000;

// Preprosto periodično osveževanje /owner (glej pogovor s Claude - "koledar
// se sam posodobi v ozadju, ko pride nova rezervacija/odpoved"). Izbrano
// namesto Supabase Realtime - manjši obseg/tveganje, in se naravno ujema z
// ŽE obstoječim cache oknom (getCachedWeekData/getCachedDayData ipd., glej
// owner/cached-queries.ts, revalidate: 20-30s). Deluje SAMO v povezavi s
// popravljeno updateTag(OWNER_CALENDAR_TAG) invalidacijo na javnih vnosih
// ([slug]/actions.ts bookAppointment/joinWaitlist, rezervacija/[token]/
// actions.ts cancelBookingByToken/rescheduleBookingByToken) - brez teh bi
// vsak router.refresh() spodaj še vedno postregel STAR predpomnjen odgovor.
//
// router.refresh() znova zažene SERVER komponento za TRENUTNO pot in vgradi
// svež izris v ŽE obstoječe drevo - NE izgubi stanja odprtih "use client"
// komponent (npr. vnašanje v ManualBookingForm), za razliko od polne
// osvežitve strani (window.location.reload()).
export default function OwnerAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    function refreshIfVisible() {
      // Preskoči, dokler je zavihek v ozadju - brez smisla osveževati
      // nekaj, kar trenutno ni vidno.
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    const interval = setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    // Ob vrnitvi na zavihek TAKOJ osveži - lastnik naj ne čaka do
    // naslednjega načrtovanega tika, če se je ravno vrnil.
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return null;
}
