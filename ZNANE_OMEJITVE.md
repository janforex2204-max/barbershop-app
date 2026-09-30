# Znane omejitve

Stvari, ki jih Fillio trenutno namenoma NE počne - ne ker bi bilo pozabljeno,
ampak ker (še) ni potrebe/prioritete. Ko postane relevantno, se prestavi v
dejansko delo.

- **Avtomatsko mesečno zaračunavanje** (Stripe naročnine, webhook obravnava
  neuspelih plačil, milostno obdobje pred ukinitvijo dostopa) — trenutno
  testni uporabniki uporabljajo Fillio brezplačno/z ročnim dogovorom.
  Zgraditi, ko bodo prve resnične plačljive stranke pripravljene na redno
  naročnino.
- **Rok za odpoved/prenaročanje** je trenutno fiksen (3 ure), enak za vse
  salone, in velja SAMO za stranko (glej /rezervacija/[token]) — lastnikova
  cancelAppointment na /owner ostaja brez časovne omejitve. Nastavljivo po
  salonu (`cancellation_notice_hours` stolpec + UI na `/owner`) dodati
  kasneje.
- **SMS obveščanje** — trenutno ni implementirano. Ko bo, uporabi Bird (ne
  Twilio) kot ponudnika — preverjena cena za Slovenijo je €0,12/segment
  (29.9.2026), Twilio ~€0,19/segment, torej Bird ~35-40 % ceneje. Registracija/
  tehnična integracija je mogoča kadarkoli brez stroška, a dejansko pošiljanje
  ne bo delovalo, dokler ni naloženo dobroimetje na računu — to je
  predplačniški model. Preveriti je treba tudi, ali ima Bird podobne omejitve
  trial računa kot Twilio (npr. pošiljanje samo na preverjene številke pred
  nadgradnjo) — to ni bilo preverjeno.
