import Link from "next/link";
import AppointmentNoteButton from "./appointment-note-button";
import { formatTimeRange, type LaidOutAppointment } from "@/lib/week-layout";

// Deljen med week-calendar.tsx (dnevni stolpci, mobilno + 0/1 zaposlenih) in
// day-employee-columns.tsx (stolpci po zaposlenem, namizje + 2+ zaposlenih,
// glej pogovor s Claude, item 3) - ista vizualna/interakcijska obravnava
// termina na obeh mestih (barva, opomba-ikona, klik izbere dan), da se
// vedenje ne razhaja med odzivnima postavitvama.
export default function CalendarBlock({
  appt,
  href,
  top,
  height,
  leftPct,
  widthPct,
  color,
}: {
  appt: LaidOutAppointment;
  href: string;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  color: string;
}) {
  return (
    // Ovojnik BREZ overflow-hidden - AppointmentNoteButton-ov modal je
    // position:fixed (glej tam), a ovojnik je SOSED (ne starš) Linku, da
    // <button> nikoli ni gnezden v <a> (neveljaven HTML, glej opombo v
    // appointment-note-button.tsx).
    <div
      className="absolute"
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 1px)`,
        width: `calc(${widthPct}% - 2px)`,
      }}
    >
      <Link
        href={href}
        scroll={false}
        title={`${appt.time} - ${appt.customerName} (${appt.service})`}
        className="absolute inset-0 rounded px-1 py-0.5 overflow-hidden text-[10px] leading-tight text-white hover:brightness-110 transition-[filter]"
        style={{ background: color }}
      >
        {/* Točen čas kot besedilo - navpična pozicija/višina bloka sama po
            sebi ni dovolj natančna za oceno prave ure (vzorec kot Fresha,
            glej pogovor s Claude). */}
        <div className="truncate text-[9px] leading-tight opacity-90">
          {formatTimeRange(appt.startMinutes, appt.endMinutes)}
        </div>
        <div className="font-semibold truncate">{appt.customerName}</div>
        <div className="truncate opacity-80">{appt.service}</div>
      </Link>
      <AppointmentNoteButton appointmentId={appt.id} initialNote={appt.ownerNote} />
    </div>
  );
}
