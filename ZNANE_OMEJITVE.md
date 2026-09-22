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
