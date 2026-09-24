import type { BusyInterval } from "./availability";

// Surova busy vrstica + kateremu zaposlenemu pripada (ali null - brez
// zaposlenega, glej appointments.employee_id v supabase/schema.sql).
export type EmployeeBusyRow = BusyInterval & { employeeId: string | null };

// Dvonivojski filter, uporabljen na VSEH šestih mestih, ki kličejo
// computeFreeSlots/isSlotAvailable (src/lib/availability.ts, ki o
// zaposlenih namenoma ne ve ničesar - ostaja nespremenjen, glej pogovor s
// Claude). Klicatelj najprej vrstice iz baze pretvori v EmployeeBusyRow[],
// nato to pokliče PRED computeFreeSlots/isSlotAvailable:
//
//  - Če salon nima NOBENEGA aktivnega zaposlenega, koncept "zaposleni" zanj
//    sploh ne obstaja - vrne vse vrstice nefiltrirane (isto vedenje kot
//    pred to funkcionalnostjo, en sam skupen koledar).
//  - Sicer vrne vrstice TEGA zaposlenega ALI brez zaposlenega (employeeId
//    null) - stari/pred-migracijski termini predstavljajo "nekdo je
//    fizično v salonu takrat" pod prejšnjim modelom in morajo blokirati
//    VSAKEGA zaposlenega, ne le svoj predal, sicer bi lahko dva različna
//    zaposlena dobila isti, že zaseden termin. Namerno konservativno -
//    napačno PRIKAZANA zasedenost je veliko cenejša napaka kot prava
//    dvojna rezervacija.
export function busyForEmployee(
  rows: EmployeeBusyRow[],
  employeeId: string | null,
  salonHasActiveEmployees: boolean
): BusyInterval[] {
  if (!salonHasActiveEmployees) return rows;
  return rows.filter((r) => r.employeeId === employeeId || r.employeeId === null);
}
