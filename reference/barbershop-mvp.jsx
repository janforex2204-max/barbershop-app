import { useState, useEffect, useCallback } from "react";
import { Scissors, Bell, Calendar, TrendingUp, X, Check, Clock, Users } from "lucide-react";

const SHOP_NAME = "Pri Marku";
const STORAGE_KEY = "barbershop-data-v1";
const HOURS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];
const SERVICES = ["Striženje", "Brada", "Striženje + Brada", "Otroško striženje"];

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("sl-SI", { weekday: "long", day: "numeric", month: "long" });
}

function weekdayOf(iso) {
  return new Date(iso + "T00:00:00").getDay();
}

function timeBucket(hhmm) {
  const h = parseInt(hhmm.split(":")[0], 10);
  return h < 13 ? "dopoldan" : "popoldan";
}

function seedData() {
  const t0 = todayISO(0);
  const history = [
    { id: "h1", name: "Jure Novak", phone: "041 111 222", weekday: weekdayOf(t0), time: "17:00" },
    { id: "h2", name: "Jure Novak", phone: "041 111 222", weekday: weekdayOf(t0), time: "17:00" },
    { id: "h3", name: "Miha Kranjc", phone: "031 222 333", weekday: weekdayOf(t0), time: "17:00" },
    { id: "h4", name: "Ana Zupan", phone: "051 333 444", weekday: weekdayOf(t0), time: "09:00" },
  ];
  const appointments = [
    { id: "a1", name: "Rok Potočnik", phone: "040 444 555", service: "Striženje + Brada", date: t0, time: "10:00", status: "booked" },
    { id: "a2", name: "Anže Kos", phone: "030 555 666", service: "Striženje", date: t0, time: "12:00", status: "booked" },
    { id: "a3", name: "Blaž Vidmar", phone: "070 666 777", service: "Brada", date: t0, time: "17:00", status: "booked" },
  ];
  return { appointments, waitlist: [], smsLog: [], history };
}

async function loadData() {
  try {
    const res = await window.storage.get(STORAGE_KEY, true);
    return res ? JSON.parse(res.value) : seedData();
  } catch {
    return seedData();
  }
}

async function saveData(data) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(data), true);
  } catch (e) {
    console.error("Storage error:", e);
  }
}

export default function BarbershopMVP() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("customer");
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayISO(0));
  const [form, setForm] = useState({ name: "", phone: "", service: SERVICES[0], time: "" });
  const [waitForm, setWaitForm] = useState({ name: "", phone: "", pref: "vseeno" });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  const persist = useCallback((next) => {
    setData(next);
    saveData(next);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  if (loading || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#1B1815", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#EFE6D8", fontFamily: "Inter, sans-serif" }}>Nalagam...</p>
      </div>
    );
  }

  const bookedForDate = data.appointments.filter((a) => a.date === selectedDate && a.status !== "cancelled");
  const takenTimes = new Set(bookedForDate.map((a) => a.time));
  const freeTimes = HOURS.filter((h) => !takenTimes.has(h));

  function bookAppointment() {
    if (!form.name || !form.phone || !form.time) {
      showToast("Izpolni ime, telefon in izberi uro.");
      return;
    }
    const appt = {
      id: "a" + Date.now(),
      name: form.name,
      phone: form.phone,
      service: form.service,
      date: selectedDate,
      time: form.time,
      status: "booked",
    };
    persist({ ...data, appointments: [...data.appointments, appt] });
    setForm({ name: "", phone: "", service: SERVICES[0], time: "" });
    showToast(`Termin potrjen: ${form.time} na ${dayLabel(selectedDate)}`);
  }

  function joinWaitlist() {
    if (!waitForm.name || !waitForm.phone) {
      showToast("Izpolni ime in telefon za čakalno vrsto.");
      return;
    }
    const entry = { id: "w" + Date.now(), ...waitForm, date: selectedDate };
    persist({ ...data, waitlist: [...data.waitlist, entry] });
    setWaitForm({ name: "", phone: "", pref: "vseeno" });
    showToast("Dodan/a na čakalno vrsto. Obvestimo te, če se sprosti termin.");
  }

  function cancelAppointment(id) {
    const appt = data.appointments.find((a) => a.id === id);
    if (!appt) return;

    const updatedAppointments = data.appointments.map((a) =>
      a.id === id ? { ...a, status: "cancelled" } : a
    );

    // 1. Match against explicit waitlist for that date
    const bucket = timeBucket(appt.time);
    const waitMatches = data.waitlist.filter(
      (w) => w.date === appt.date && (w.pref === "vseeno" || w.pref === bucket)
    );

    // 2. AI pattern match: past customers who historically come this weekday+time
    const wd = weekdayOf(appt.date);
    const patternMatches = data.history.filter(
      (h) => h.weekday === wd && h.time === appt.time
    );
    const seenPhones = new Set(waitMatches.map((w) => w.phone));
    const uniquePatternMatches = [];
    for (const p of patternMatches) {
      if (!seenPhones.has(p.phone)) {
        seenPhones.add(p.phone);
        uniquePatternMatches.push(p);
      }
    }

    const newLogs = [];
    waitMatches.forEach((w) => {
      newLogs.push({
        id: "s" + Date.now() + Math.random(),
        to: w.name,
        phone: w.phone,
        text: `Sprostil se je termin ob ${appt.time} (${dayLabel(appt.date)}) pri ${SHOP_NAME}. Odgovori DA za rezervacijo.`,
        reason: "čakalna vrsta",
      });
    });
    uniquePatternMatches.forEach((p) => {
      newLogs.push({
        id: "s" + Date.now() + Math.random(),
        to: p.name,
        phone: p.phone,
        text: `Prost termin ob ${appt.time} (${dayLabel(appt.date)}) — tvoj običajni čas pri ${SHOP_NAME}. Odgovori DA za rezervacijo.`,
        reason: "AI zazna vzorec",
      });
    });

    persist({ ...data, appointments: updatedAppointments, smsLog: [...data.smsLog, ...newLogs] });

    if (newLogs.length > 0) {
      showToast(`Termin odpovedan. Poslanih ${newLogs.length} SMS obvestil.`);
    } else {
      showToast("Termin odpovedan. Ni ustreznih strank za obvestilo.");
    }
  }

  function claimFromLog(log) {
    const cancelledSlot = data.appointments.find(
      (a) => a.status === "cancelled" && a.time && log.text.includes(a.time)
    );
    const time = cancelledSlot ? cancelledSlot.time : HOURS[0];
    const date = cancelledSlot ? cancelledSlot.date : selectedDate;
    const newAppt = {
      id: "a" + Date.now(),
      name: log.to,
      phone: log.phone,
      service: SERVICES[0],
      date,
      time,
      status: "filled",
    };
    persist({
      ...data,
      appointments: [...data.appointments, newAppt],
      smsLog: data.smsLog.filter((l) => l.id !== log.id),
    });
    showToast(`${log.to} je zapolnil/a sproščen termin.`);
  }

  const totalToday = data.appointments.filter((a) => a.date === todayISO(0) && a.status !== "cancelled").length;
  const cancelledToday = data.appointments.filter((a) => a.date === todayISO(0) && a.status === "cancelled").length;
  const filledToday = data.appointments.filter((a) => a.date === todayISO(0) && a.status === "filled").length;

  const dateOptions = [0, 1, 2].map((o) => todayISO(o));

  const fontDisplay = "'Fraunces', Georgia, serif";
  const fontBody = "'Inter', system-ui, sans-serif";

  return (
    <div style={{ minHeight: "100vh", background: "#1B1815", fontFamily: fontBody, color: "#EFE6D8" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      <header style={{ borderBottom: "1px solid #3A342C", padding: "28px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Scissors size={22} color="#A67C3D" />
            <h1 style={{ fontFamily: fontDisplay, fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
              {SHOP_NAME}
            </h1>
          </div>
          <nav style={{ display: "flex", gap: 4, background: "#25201A", padding: 4, borderRadius: 6 }}>
            <button
              onClick={() => setTab("customer")}
              style={tabStyle(tab === "customer")}
            >
              Rezerviraj
            </button>
            <button
              onClick={() => setTab("owner")}
              style={tabStyle(tab === "owner")}
            >
              Nadzorna plošča
            </button>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 80px" }}>
        {tab === "customer" ? (
          <CustomerView
            data={data}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            dateOptions={dateOptions}
            freeTimes={freeTimes}
            form={form}
            setForm={setForm}
            bookAppointment={bookAppointment}
            waitForm={waitForm}
            setWaitForm={setWaitForm}
            joinWaitlist={joinWaitlist}
            fontDisplay={fontDisplay}
          />
        ) : (
          <OwnerView
            data={data}
            totalToday={totalToday}
            cancelledToday={cancelledToday}
            filledToday={filledToday}
            cancelAppointment={cancelAppointment}
            claimFromLog={claimFromLog}
            fontDisplay={fontDisplay}
          />
        )}
      </main>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#EFE6D8", color: "#1B1815", padding: "12px 20px", borderRadius: 6,
          fontSize: 14, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", maxWidth: "90%",
          textAlign: "center",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function tabStyle(active) {
  return {
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    background: active ? "#8C2F2F" : "transparent",
    color: active ? "#EFE6D8" : "#A39D91",
    fontFamily: "Inter, sans-serif",
  };
}

function CustomerView({ data, selectedDate, setSelectedDate, dateOptions, freeTimes, form, setForm, bookAppointment, waitForm, setWaitForm, joinWaitlist, fontDisplay }) {
  return (
    <div>
      <h2 style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Izberi dan</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        {dateOptions.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            style={{
              flex: 1, padding: "10px 8px", fontSize: 13, borderRadius: 6, cursor: "pointer",
              border: `1px solid ${selectedDate === d ? "#A67C3D" : "#3A342C"}`,
              background: selectedDate === d ? "#2E2620" : "transparent",
              color: "#EFE6D8", fontFamily: "Inter, sans-serif", textTransform: "capitalize",
            }}
          >
            {dayLabel(d).split(",")[0]}
          </button>
        ))}
      </div>

      {freeTimes.length > 0 ? (
        <>
          <h2 style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Prosti termini</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 28 }}>
            {freeTimes.map((t) => (
              <button
                key={t}
                onClick={() => setForm({ ...form, time: t })}
                style={{
                  padding: "10px 0", fontSize: 13, borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${form.time === t ? "#A67C3D" : "#3A342C"}`,
                  background: form.time === t ? "#3A2A1A" : "transparent",
                  color: "#EFE6D8", fontFamily: "Inter, sans-serif",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ border: "1px solid #3A342C", borderRadius: 8, padding: 20 }}>
            <input placeholder="Ime in priimek" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} style={inputStyle}>
              {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={bookAppointment} style={primaryBtn}>
              Rezerviraj termin{form.time ? ` — ${form.time}` : ""}
            </button>
          </div>
        </>
      ) : (
        <div style={{ border: "1px solid #3A342C", borderRadius: 8, padding: 20 }}>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: "#C9C2B4" }}>
            Ta dan je popolnoma zaseden. Pridruži se čakalni vrsti — obvestimo te takoj, ko se kaj sprosti.
          </p>
          <input placeholder="Ime in priimek" value={waitForm.name} onChange={(e) => setWaitForm({ ...waitForm, name: e.target.value })} style={inputStyle} />
          <input placeholder="Telefon" value={waitForm.phone} onChange={(e) => setWaitForm({ ...waitForm, phone: e.target.value })} style={inputStyle} />
          <select value={waitForm.pref} onChange={(e) => setWaitForm({ ...waitForm, pref: e.target.value })} style={inputStyle}>
            <option value="vseeno">Kadarkoli</option>
            <option value="dopoldan">Dopoldan</option>
            <option value="popoldan">Popoldan</option>
          </select>
          <button onClick={joinWaitlist} style={primaryBtn}>Pridruži se čakalni vrsti</button>
        </div>
      )}
    </div>
  );
}

function OwnerView({ data, totalToday, cancelledToday, filledToday, cancelAppointment, claimFromLog, fontDisplay }) {
  const todays = data.appointments.filter((a) => a.date === todayISO(0)).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div>
      <h2 style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Danes na kratko</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
        <Stat icon={<Calendar size={16} color="#A67C3D" />} label="Termini" value={totalToday} fontDisplay={fontDisplay} />
        <Stat icon={<X size={16} color="#C97D7D" />} label="Odpovedi" value={cancelledToday} fontDisplay={fontDisplay} />
        <Stat icon={<TrendingUp size={16} color="#7FA06B" />} label="Zapolnjene odpovedi" value={filledToday} fontDisplay={fontDisplay} />
      </div>

      <h2 style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Urnik za danes</h2>
      <div style={{ border: "1px solid #3A342C", borderRadius: 8, marginBottom: 32 }}>
        {todays.length === 0 && (
          <p style={{ padding: 20, fontSize: 14, color: "#A39D91", margin: 0 }}>Ni terminov za danes.</p>
        )}
        {todays.map((a, i) => (
          <div key={a.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px", borderBottom: i < todays.length - 1 ? "1px solid #2A2520" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontFamily: fontDisplay, fontSize: 16, color: "#A67C3D", minWidth: 48 }}>{a.time}</span>
              <div>
                <div style={{
                  fontSize: 14, fontWeight: 500,
                  textDecoration: a.status === "cancelled" ? "line-through" : "none",
                  color: a.status === "cancelled" ? "#7A756A" : "#EFE6D8",
                }}>
                  {a.name}{a.status === "filled" && <span style={{ color: "#7FA06B", fontSize: 12, marginLeft: 8 }}>(zapolnjeno)</span>}
                </div>
                <div style={{ fontSize: 12, color: "#8A8377" }}>{a.service}</div>
              </div>
            </div>
            {a.status === "booked" && (
              <button onClick={() => cancelAppointment(a.id)} style={cancelBtn}>Odpovej</button>
            )}
          </div>
        ))}
      </div>

      <h2 style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        <Bell size={18} color="#A67C3D" /> Poslana SMS obvestila
      </h2>
      <p style={{ fontSize: 12, color: "#8A8377", margin: "0 0 12px" }}>
        Simulacija — v resnični postavitvi to gredo prek SMS ponudnika (npr. Twilio).
      </p>
      <div style={{ border: "1px solid #3A342C", borderRadius: 8 }}>
        {data.smsLog.length === 0 && (
          <p style={{ padding: 20, fontSize: 14, color: "#A39D91", margin: 0 }}>Ni aktivnih obvestil. Odpovej termin, da vidiš, kako sistem reagira.</p>
        )}
        {data.smsLog.map((log, i) => (
          <div key={log.id} style={{
            padding: "14px 18px", borderBottom: i < data.smsLog.length - 1 ? "1px solid #2A2520" : "none",
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {log.to} <span style={{ fontSize: 11, color: "#A67C3D", marginLeft: 6 }}>{log.reason === "AI zazna vzorec" ? "AI zazna vzorec" : "čakalna vrsta"}</span>
              </div>
              <div style={{ fontSize: 12, color: "#8A8377", marginTop: 2 }}>{log.text}</div>
            </div>
            <button onClick={() => claimFromLog(log)} style={confirmBtn}>
              <Check size={12} /> Potrdi
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, fontDisplay }) {
  return (
    <div style={{ border: "1px solid #3A342C", borderRadius: 8, padding: "16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {icon}
        <span style={{ fontSize: 12, color: "#A39D91" }}>{label}</span>
      </div>
      <div style={{ fontFamily: fontDisplay, fontSize: 30, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: 6,
  border: "1px solid #3A342C", background: "#151210", color: "#EFE6D8",
  fontSize: 14, fontFamily: "Inter, sans-serif", boxSizing: "border-box",
};

const primaryBtn = {
  width: "100%", padding: "12px 0", borderRadius: 6, border: "none",
  background: "#8C2F2F", color: "#EFE6D8", fontSize: 14, fontWeight: 600,
  cursor: "pointer", fontFamily: "Inter, sans-serif", marginTop: 4,
};

const cancelBtn = {
  padding: "6px 12px", borderRadius: 5, border: "1px solid #C97D7D",
  background: "transparent", color: "#C97D7D", fontSize: 12,
  cursor: "pointer", fontFamily: "Inter, sans-serif",
};

const confirmBtn = {
  display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 5,
  border: "1px solid #7FA06B", background: "transparent", color: "#7FA06B", fontSize: 12,
  cursor: "pointer", fontFamily: "Inter, sans-serif", whiteSpace: "nowrap",
};
