import { resolveDayWindow, resolveDayBreak, computeFreeSlots, type BusyInterval } from "./availability";
import type { SalonDayHours } from "@/types/database.types";

// Surova busy vrstica + kateremu zaposlenemu pripada (ali null - brez
// zaposlenega, glej appointments.employee_id v supabase/schema.sql).
export type EmployeeBusyRow = BusyInterval & { employeeId: string | null };

// UI/vhodni signal "vseeno kdo, samodejno dodeli prostega" (glej pogovor s
// Claude - "Vsi zaposleni" na /[slug]) - NIKOLI dejansko zapisan v
// appointments.employee_id (mora biti v celoti "odvit" v pravi UUID pred
// vsakim INSERT-om, glej bookAppointment v [slug]/actions.ts). Namerno
// RAZLIČNO od employee_id = null (glej busyForEmployee zgoraj) - null bi
// prek dvonivojskega filtra dejansko BLOKIRAL termin za vsakega zaposlenega.
export const ANY_EMPLOYEE = "any";

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

// Iz že naloženega EmployeeBusyRow[] (isti vir kot busyForEmployee zgoraj)
// zgradi predal PO zaposlenem - vsak dobi SVOJE vrstice + skupne
// employeeId=null vrstice (isti konservativen "OR null" princip kot
// busyForEmployee), brez nove omrežne poizvedbe. Uporabljeno SAMO za "Vsi
// zaposleni" (glej computeFreeSlotsAnyEmployee spodaj in pogovor s Claude) -
// za en konkreten izbran zaposleni ostane busyForEmployee.
export function groupBusyByEmployee(
  rows: EmployeeBusyRow[],
  employees: { id: string }[]
): Map<string, BusyInterval[]> {
  const nullRows = rows.filter((r) => r.employeeId === null);
  const map = new Map<string, BusyInterval[]>();
  for (const emp of employees) {
    map.set(emp.id, [...rows.filter((r) => r.employeeId === emp.id), ...nullRows]);
  }
  return map;
}

// "Vsi zaposleni" (glej pogovor s Claude, arhitekturni načrt) - za VSAKEGA
// aktivnega zaposlenega NEODVISNO izračuna proste termine (lasten urnik/
// premor/zasedenost - isti resolveDayWindow/resolveDayBreak/computeFreeSlots
// iz src/lib/availability.ts, ki ostane BREZ sprememb) in vrne UNIJO (termin
// je "prost", če je prost VSAJ EDEN) - NE presek. To je samo prikazna
// razpoložljivost za stranko PRED oddajo - dejanska dodelitev konkretnega
// zaposlenega se zgodi šele na strežniku ob potrditvi (glej bookAppointment
// v [slug]/actions.ts), ne tukaj.
export function computeFreeSlotsAnyEmployee(
  employees: { id: string; hours: SalonDayHours[] }[],
  dateISO: string,
  busyByEmployee: Map<string, BusyInterval[]>,
  serviceDurationMinutes: number
): string[] {
  const free = new Set<string>();
  for (const emp of employees) {
    const window = resolveDayWindow(emp.hours, dateISO);
    const brk = resolveDayBreak(emp.hours, dateISO);
    const busy = busyByEmployee.get(emp.id) ?? [];
    const withBreak = brk ? [...busy, brk] : busy;
    for (const t of computeFreeSlots(window, withBreak, serviceDurationMinutes)) free.add(t);
  }
  return [...free].sort();
}
