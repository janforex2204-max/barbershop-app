"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";
import { updateAppointmentNote } from "./actions";

// Majhna ikona v kotu koledarskega bloka (owner/week-calendar.tsx) - klik
// odpre SREDINSKO poravnan modal (ne "lebdeč" popover ob ikoni), namerno
// enostavnejše - blok je znotraj overflow-y-auto drsne mreže, natančno
// pozicioniran popover ob ikoni bi ga tvegal obrezati na robu.
//
// Gumb je SIBLING elementu <Link> v week-calendar.tsx (ne gnezden vanj) -
// <button> znotraj <a> ni veljaven HTML in bi klik na ikono sprožil tudi
// Linkovo navigacijo. onClick tu zato NE potrebuje preventDefault/
// stopPropagation za "pobeg" iz Linka - gumb je ločen element.
//
// Opazno RAZLIČEN videz glede na stanje (glej pogovor s Claude - prejšnja
// različica se je zanašala samo na opacity 40 % proti 100 %, kar je bilo
// na različnih barvah koledarskih blokov (vsak zaposleni ima svojo) v praksi
// premalo opazno, da bi lastnik na prvi pogled ločil termine z opombo).
// Z opombo: poln zlat krog (--color-gold - isti barvni žeton kot povsod
// drugod za "pomembno/izpostavljeno", npr. ura termina) - dosledno opazen
// NE GLEDE na barvo bloka pod njim. Brez opombe: samo tanek svetel obris
// brez polnila, nizka opacity - viden dovolj, da je odkrijen (ni popolnoma
// skrit), a jasno diskretnejši od polnega zlatega kroga.
export default function AppointmentNoteButton({
  appointmentId,
  initialNote,
}: {
  appointmentId: string;
  initialNote: string | null;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [draft, setDraft] = useState(initialNote ?? "");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasNote = note.trim().length > 0;

  function openModal() {
    setDraft(note);
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error: saveError } = await updateAppointmentNote(appointmentId, draft);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setNote(draft.trim());
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={hasNote ? "Opomba" : "Dodaj opombo"}
        className={`absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center cursor-pointer transition-all ${
          hasNote
            ? "bg-gold opacity-100 shadow-sm"
            : "bg-black/10 border border-white/40 opacity-55 hover:opacity-90 hover:bg-black/25"
        }`}
      >
        <StickyNote size={8} className={hasNote ? "text-ink" : "text-white"} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            // bg-ink-elevated, NE bg-panel - --color-panel je v temni temi
            // NAMENOMA transparent (glej pogovor s Claude - kartice v TOKU
            // strani nimajo lastnega ozadja), kar je tu, na plavajočem
            // modalu čez zatemnjen zaslon, naredilo besedilo skoraj
            // neberljivo (prosevala je zatemnjena stran ZA modalom, ne
            // trdna podlaga). ink-elevated je pravi NEPROSOJEN "dvignjena
            // površina" žeton, narejen točno za ta primer.
            className="w-full max-w-sm rounded-lg border border-border bg-ink-elevated shadow-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-cream mb-2">Interna opomba</h3>
            <p className="text-xs text-cream-faint mb-2">
              Vidna samo tebi - stranka je nikoli ne vidi.
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-md border border-border bg-ink-field px-3 py-2 text-cream text-sm mb-3"
              placeholder="npr. stalna stranka, prinese svojo barvo..."
            />
            {error && <p className="text-xs text-rose mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-border text-cream-dim hover:bg-ink-soft cursor-pointer"
              >
                Prekliči
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-md bg-burgundy text-on-accent font-medium cursor-pointer hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Shranjujem..." : "Shrani"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
