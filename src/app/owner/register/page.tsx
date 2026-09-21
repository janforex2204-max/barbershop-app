"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { registerOwner } from "./actions";
import type { SalonDayHours } from "@/types/database.types";

type Category = "frizerski" | "kozmeticni" | "other" | null;

const SUBTYPES: Record<"frizerski" | "kozmeticni", string[]> = {
  frizerski: ["Barbershop", "Ženski frizerski salon", "Univerzalni salon"],
  kozmeticni: ["Nohtni studio", "Ličenje", "Nega obraza in telesa"],
};

const DAYS = [
  "Ponedeljek",
  "Torek",
  "Sreda",
  "Četrtek",
  "Petek",
  "Sobota",
  "Nedelja",
];

// Privzet urnik, prikazan ob prvem obisku koraka 3 - lastnik ga lahko
// spremeni za vsak dan posebej (glej DaySchedule spodaj).
function defaultHours(): SalonDayHours[] {
  return DAYS.map((day) => {
    if (day === "Nedelja") return { day, closed: true, from: "09:00", to: "19:00" };
    if (day === "Sobota") return { day, closed: false, from: "09:00", to: "13:00" };
    return { day, closed: false, from: "09:00", to: "19:00" };
  });
}

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<Category>(null);
  const [subtype, setSubtype] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [salonName, setSalonName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState<SalonDayHours[]>(defaultHours);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isKnownCategory = category === "frizerski" || category === "kozmeticni";
  const isOtherCategory = category === "other";
  const isCustomSubtype = subtype === "custom_subtype";
  const needsCustomText = isOtherCategory || isCustomSubtype;

  const canContinueStep1 = isKnownCategory
    ? !!subtype && (!isCustomSubtype || customCategory.trim().length > 0)
    : isOtherCategory
    ? customCategory.trim().length > 0
    : false;

  const canContinueStep2 = salonName.trim().length > 0 && address.trim().length > 0;

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const canSubmitStep3 =
    phone.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    passwordsMatch &&
    whatsappConsent;

  function pickCategory(next: Exclude<Category, null>) {
    setCategory(next);
    setSubtype(null);
    setCustomCategory("");
  }

  function pickSubtype(value: string) {
    setSubtype(value);
    setCustomCategory("");
  }

  function toggleDayClosed(index: number) {
    setHours((prev) =>
      prev.map((d, i) => (i === index ? { ...d, closed: !d.closed } : d))
    );
  }

  function updateDayTime(index: number, field: "from" | "to", value: string) {
    setHours((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  }

  const categoryDisplay =
    category === "frizerski"
      ? "Frizerski salon"
      : category === "kozmeticni"
      ? "Kozmetični salon"
      : isOtherCategory
      ? "Druga dejavnost"
      : "";

  const subtypeDisplay = isOtherCategory
    ? customCategory
    : isCustomSubtype
    ? customCategory
    : subtype ?? "";

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    // try/catch je NAMENOMA tu, ne samo v registerOwner - druga linija
    // obrambe, če bi klic same server akcije zavrnil promise (npr. omrežna
    // napaka), namesto da bi wizard ostal "obtičal" v stanju submitting brez
    // vidnega sporočila.
    try {
      const formData = new FormData();
      formData.set("category", categoryDisplay);
      formData.set("subtype", subtypeDisplay);
      formData.set("salon_name", salonName);
      formData.set("address", address);
      formData.set("phone", phone);
      formData.set("hours", JSON.stringify(hours));
      formData.set("email", email);
      formData.set("password", password);
      formData.set("whatsapp_consent", whatsappConsent ? "true" : "false");

      const result = await registerOwner(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSubmitted(true);
      setStep(4);
    } catch (e) {
      console.error(e);
      setError("Prišlo je do nepričakovane napake. Poskusi znova.");
    } finally {
      setSubmitting(false);
    }
  }

  const bar1 = step >= 1 ? "bg-white" : "bg-white/15";
  const bar2 = step >= 2 ? "bg-white" : "bg-white/15";
  const bar3 = step >= 3 ? "bg-fillio-tealDark" : "bg-white/15";
  const bar4 = step >= 4 ? "bg-fillio-tealLight" : "bg-white/15";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-fillio-dark font-marketing text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-40 select-none font-display text-[880px] font-semibold leading-none text-white/[0.03]"
      />

      {/* top bar */}
      <div className="relative z-10 flex h-24 flex-shrink-0 items-center justify-between border-b border-white/[0.08] px-20">
        <Image src="/logo.png" alt="Fillio" width={170} height={40} className="h-10 w-auto" />
        <div className="text-sm text-white/50">
          Že imate račun?{" "}
          <Link href="/owner/login" className="font-bold text-white">
            Prijava
          </Link>
        </div>
      </div>

      {/* progress: 4 bars matching the logo */}
      <div className="relative z-10 flex gap-2.5 px-20 pt-8">
        <span className={`block h-[5px] w-[70px] rounded ${bar1}`} />
        <span className={`block h-[5px] w-[70px] rounded ${bar2}`} />
        <span className={`block h-[5px] w-[70px] rounded ${bar3}`} />
        <span className={`block h-[5px] w-[70px] rounded ${bar4}`} />
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="relative z-10 flex-grow px-20 pb-16 pt-9">
          <h1 className="mb-2.5 font-display text-[38px] font-semibold leading-[1.15]">
            Kakšno dejavnost vodite?
          </h1>
          <p className="mb-8 text-[15px] text-white/50">
            Izberite kategorijo, ki najbolje opisuje vaš posel.
          </p>

          <div className="mb-[30px] grid grid-cols-3 gap-5">
            <button
              type="button"
              onClick={() => pickCategory("frizerski")}
              className={`cursor-pointer rounded-md border-2 bg-[#17181B] p-6 text-left ${
                category === "frizerski" ? "border-fillio-tealDark" : "border-white/[0.08]"
              }`}
            >
              <div className="mb-3.5 h-1.5 w-7 bg-fillio-tealDark" />
              <h3 className="mb-1.5 text-lg font-bold">Frizerski salon</h3>
              <p className="text-[13px] text-white/50">Barbershop, ženski ali univerzalni salon</p>
            </button>

            <button
              type="button"
              onClick={() => pickCategory("kozmeticni")}
              className={`cursor-pointer rounded-md border-2 bg-[#17181B] p-6 text-left ${
                category === "kozmeticni" ? "border-fillio-tealLight" : "border-white/[0.08]"
              }`}
            >
              <div className="mb-3.5 h-1.5 w-7 bg-fillio-tealLight" />
              <h3 className="mb-1.5 text-lg font-bold">Kozmetični salon</h3>
              <p className="text-[13px] text-white/50">Nohti, ličenje, nega obraza in telesa</p>
            </button>

            <button
              type="button"
              onClick={() => pickCategory("other")}
              className={`cursor-pointer rounded-md border-2 border-dashed bg-[#17181B] p-6 text-left ${
                isOtherCategory ? "border-white/60" : "border-white/20"
              }`}
            >
              <div className="mb-3.5 h-1.5 w-7 bg-white/50" />
              <h3 className="mb-1.5 text-lg font-bold">Nekaj drugega</h3>
              <p className="text-[13px] text-white/50">Vaša dejavnost ni na seznamu? Ni problema.</p>
            </button>
          </div>

          {isKnownCategory && (
            <div className="mb-[30px]">
              <p className="mb-3.5 text-[13px] font-bold uppercase tracking-wide text-white/40">
                Izberite podkategorijo
              </p>
              <div className="flex flex-wrap gap-3">
                {SUBTYPES[category].map((label) => {
                  const selected = subtype === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => pickSubtype(label)}
                      className={`cursor-pointer rounded-[3px] border px-[18px] py-3 text-sm font-semibold ${
                        selected
                          ? "border-fillio-tealLight bg-fillio-tealLight text-fillio-dark"
                          : "border-white/15 text-white/75"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => pickSubtype("custom_subtype")}
                  className={`cursor-pointer rounded-[3px] border border-dashed px-[18px] py-3 text-sm font-semibold ${
                    isCustomSubtype
                      ? "border-fillio-tealLight bg-fillio-tealLight text-fillio-dark"
                      : "border-white/30 text-white/55"
                  }`}
                >
                  + Dodaj svojo storitev
                </button>
              </div>
            </div>
          )}

          {needsCustomText && (
            <div className="mb-[30px] max-w-[500px]">
              <label htmlFor="r-other" className="mb-3.5 block text-[13px] font-bold uppercase tracking-wide text-white/40">
                {isOtherCategory ? "Kako bi opisali svojo dejavnost?" : "Poimenujte svojo storitev"}
              </label>
              <input
                id="r-other"
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder={
                  isOtherCategory
                    ? "npr. Fizioterapija, wellness studio, DJ storitve ..."
                    : "npr. Trajno lakiranje, brada in oblikovanje ..."
                }
                className="w-full rounded-[3px] border border-white/15 bg-[#17181B] px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
              />
            </div>
          )}

          {canContinueStep1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="cursor-pointer rounded-[3px] bg-fillio-tealLight px-[34px] py-[15px] text-[15px] font-bold text-fillio-dark"
            >
              Naprej →
            </button>
          )}
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="relative z-10 flex-grow px-20 pb-16 pt-9">
          <h1 className="mb-2.5 font-display text-[38px] font-semibold leading-[1.15]">
            Osnovni podatki
          </h1>
          <p className="mb-[30px] text-[15px] text-white/50">
            Ime in naslov, ki ju bodo videle vaše stranke.
          </p>

          <div className="mb-[34px] flex max-w-[560px] flex-col gap-5">
            <div>
              <label htmlFor="r-name" className="mb-2 block text-[13px] font-bold text-white/60">
                Ime salona
              </label>
              <input
                id="r-name"
                type="text"
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                placeholder="npr. Barbershop pr' Kljuni"
                className="w-full rounded-[3px] border border-white/15 bg-[#17181B] px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label htmlFor="r-addr" className="mb-2 block text-[13px] font-bold text-white/60">
                Naslov
              </label>
              <input
                id="r-addr"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ulica in hišna številka, mesto"
                className="w-full rounded-[3px] border border-white/15 bg-[#17181B] px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="cursor-pointer rounded-[3px] border border-white/25 px-[30px] py-[15px] text-[15px] font-bold"
            >
              ← Nazaj
            </button>
            {canContinueStep2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="cursor-pointer rounded-[3px] bg-fillio-tealLight px-[34px] py-[15px] text-[15px] font-bold text-fillio-dark"
              >
                Naprej →
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div className="relative z-10 flex-grow px-20 pb-16 pt-9">
          <h1 className="mb-2.5 font-display text-[38px] font-semibold leading-[1.15]">
            Kontakt, delovni čas in račun
          </h1>
          <p className="mb-[30px] text-[15px] text-white/50">
            Za obvestila o rezervacijah, stik s strankami in prijavo v nadzorno ploščo.
          </p>

          <div className="mb-[34px] grid max-w-[720px] grid-cols-2 gap-5">
            <div>
              <label htmlFor="r-phone" className="mb-2 block text-[13px] font-bold text-white/60">
                Telefon
              </label>
              <input
                id="r-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="040 123 456"
                className="w-full rounded-[3px] border border-white/15 bg-[#17181B] px-3.5 py-3 text-[15px] text-white placeholder:text-white/30"
              />
            </div>
            <div>
              <label htmlFor="r-email" className="mb-2 block text-[13px] font-bold text-white/60">
                Kontaktni e-poštni naslov
              </label>
              <input
                id="r-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="ime@primer.si"
                aria-invalid={error ? true : undefined}
                className={`w-full rounded-[3px] border bg-[#17181B] px-3.5 py-3 text-[15px] text-white placeholder:text-white/30 ${
                  error ? "border-rose-400" : "border-white/15"
                }`}
              />
              {/* Skoraj vsaka napaka tu (podvojen e-mail, prekratko geslo,
                  napaka pri signUp ...) je konceptualno vezana na e-poštni
                  naslov/račun, zato prikazan tu namesto v splošnem pasu na
                  vrhu koraka - glej handleSubmit/registerOwner. */}
              {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
            </div>
          </div>

          <div className="mb-[34px] max-w-[720px]">
            <p className="mb-3.5 text-[13px] font-bold text-white/60">Delovni čas</p>
            <div className="flex flex-col gap-2 rounded-md border border-white/[0.08] bg-[#17181B] p-4">
              {hours.map((d, i) => (
                <div key={d.day} className="grid grid-cols-[120px_90px_1fr_auto_1fr] items-center gap-3">
                  <span className="text-sm font-semibold text-white/80">{d.day}</span>
                  <button
                    type="button"
                    onClick={() => toggleDayClosed(i)}
                    className={`cursor-pointer rounded-[3px] px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide ${
                      d.closed
                        ? "bg-white/10 text-white/50"
                        : "bg-fillio-tealLight text-fillio-dark"
                    }`}
                  >
                    {d.closed ? "Zaprto" : "Odprto"}
                  </button>
                  <input
                    type="time"
                    value={d.from}
                    disabled={d.closed}
                    onChange={(e) => updateDayTime(i, "from", e.target.value)}
                    className="w-full rounded-[3px] border border-white/15 bg-fillio-dark px-2.5 py-1.5 text-sm text-white disabled:opacity-30"
                  />
                  <span className="text-center text-xs text-white/40">–</span>
                  <input
                    type="time"
                    value={d.to}
                    disabled={d.closed}
                    onChange={(e) => updateDayTime(i, "to", e.target.value)}
                    className="w-full rounded-[3px] border border-white/15 bg-fillio-dark px-2.5 py-1.5 text-sm text-white disabled:opacity-30"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mb-[34px] grid max-w-[720px] grid-cols-2 gap-5">
            <div>
              <label htmlFor="r-password" className="mb-2 block text-[13px] font-bold text-white/60">
                Geslo
              </label>
              <div className="relative">
                <input
                  id="r-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Vsaj 8 znakov"
                  minLength={8}
                  className="w-full rounded-[3px] border border-white/15 bg-[#17181B] px-3.5 py-3 pr-16 text-[15px] text-white placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-white/50"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPassword ? "Skrij" : "Pokaži"}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-white/35">S tem geslom se boste kasneje prijavili v nadzorno ploščo.</p>
            </div>
            <div>
              <label htmlFor="r-password-confirm" className="mb-2 block text-[13px] font-bold text-white/60">
                Ponovi geslo
              </label>
              <div className="relative">
                <input
                  id="r-password-confirm"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ponovno vnesi geslo"
                  minLength={8}
                  className="w-full rounded-[3px] border border-white/15 bg-[#17181B] px-3.5 py-3 pr-16 text-[15px] text-white placeholder:text-white/30"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-white/50"
                >
                  {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showConfirmPassword ? "Skrij" : "Pokaži"}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1.5 text-xs text-rose-300">Gesli se ne ujemata.</p>
              )}
            </div>
          </div>

          <label className="mb-[34px] flex max-w-[720px] items-start gap-2.5 text-[13px] text-white/60">
            <input
              type="checkbox"
              checked={whatsappConsent}
              onChange={(e) => setWhatsappConsent(e.target.checked)}
              className="mt-0.5"
            />
            Strinjam se, da se moja telefonska številka uporabi za WhatsApp
            obveščanje strank
          </label>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="cursor-pointer rounded-[3px] border border-white/25 px-[30px] py-[15px] text-[15px] font-bold"
            >
              ← Nazaj
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmitStep3 || submitting}
              className="cursor-pointer rounded-[3px] bg-fillio-tealLight px-[34px] py-[15px] text-[15px] font-bold text-fillio-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Pošiljam ..." : "Oddaj prijavo →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: confirmation */}
      {step === 4 && submitted && (
        <div className="relative z-10 flex flex-grow items-center justify-center">
          <div className="max-w-[560px] text-center">
            <div className="mb-7 flex justify-center gap-2">
              <span className="block h-1.5 w-6 bg-white" />
              <span className="block h-1.5 w-6 bg-white" />
              <span className="block h-1.5 w-6 bg-fillio-tealDark" />
              <span className="block h-1.5 w-6 bg-fillio-tealLight" />
            </div>

            <h1 className="mb-4 font-display text-[36px] font-semibold leading-[1.2]">
              Hvala, {salonName || "salon"}!
            </h1>
            <p className="mb-[34px] text-base leading-[1.6] text-white/60">
              Preveri e-pošto in potrdi svoj e-poštni naslov. Vaša prijava je
              nato v pregledu — odobrimo jo v manj kot 24 urah, o čemer vas
              prav tako obvestimo po e-pošti.
            </p>

            <div className="mb-[34px] rounded-md border border-white/[0.08] bg-[#17181B] p-6 text-left">
              <div className="flex justify-between border-b border-white/[0.08] py-2 text-sm">
                <span className="text-white/50">Dejavnost</span>
                <span className="font-bold">{categoryDisplay}</span>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-white/50">Podkategorija</span>
                <span className="font-bold">{subtypeDisplay}</span>
              </div>
            </div>

            <Link href="/" className="text-sm font-semibold text-white/60">
              ← Nazaj na domačo stran
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
