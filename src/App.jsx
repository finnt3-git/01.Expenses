import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Download, Users, Receipt, Scale, X, Pencil, RefreshCw, ArrowRight, HandCoins } from "lucide-react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

// Single Firestore document holds all shared state for the couple.
const DATA_REF = doc(db, "shared", "data");

// Currencies. Everything is converted to CAD under the hood so the balance
// stays correct no matter what currency an expense was entered in.
const CURRENCIES = ["CAD", "USD", "EUR"];
const SYM = { CAD: "CA$", USD: "US$", EUR: "€" };

// Fallback rates: how many CAD one unit of each currency is worth.
// Seeded from mid-June 2026 mid-market rates; used only if the live fetch fails.
const FALLBACK_RATES = { CAD: 1, USD: 1.389, EUR: 1.62, asOf: "14 Jun 2026 (offline rates)" };

// Merge partial fields into the Firestore document.
const save = (fields) => setDoc(DATA_REF, fields, { merge: true }).catch((e) => console.error("save failed", e));

// Pull live rates with CAD as the base, keep only the three we use.
async function fetchRates() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/CAD");
    const data = await res.json();
    if (data && data.rates) {
      // API gives CAD->X. We want "X in CAD" = 1 / (CAD->X).
      const r = {
        CAD: 1,
        USD: 1 / data.rates.USD,
        EUR: 1 / data.rates.EUR,
        asOf: new Date(data.time_last_update_unix * 1000).toLocaleDateString("en-IE") + " (live)",
      };
      if (isFinite(r.USD) && isFinite(r.EUR)) return r;
    }
  } catch (e) { /* fall through */ }
  return null;
}

const CATEGORIES = ["Groceries", "Rent & bills", "Eating out", "Travel", "Household", "Health", "Fun", "Other"];
const CAT_COLOUR = { "Groceries": "#5b8c6e", "Rent & bills": "#c97b4a", "Eating out": "#b5505a", "Travel": "#4a7a99", "Household": "#8a7355", "Health": "#7a6a9c", "Fun": "#cf9a4a", "Other": "#7d7d7d" };

const fmtCad = (n) => "CA$" + (Math.round(n * 100) / 100).toFixed(2);
const fmtCur = (n, cur) => SYM[cur] + (Math.round(n * 100) / 100).toFixed(2);

export default function App() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [names, setNames] = useState({ a: "Me", b: "Partner" });
  const [rates, setRates] = useState(FALLBACK_RATES);
  const [settlements, setSettlements] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editNames, setEditNames] = useState(false);
  const [tab, setTab] = useState("balance");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const applySnapshot = (d) => {
    if (d.expenses) setExpenses(d.expenses);
    if (d.names) setNames(d.names);
    if (d.settlements) setSettlements(d.settlements);
    if (d.rates) setRates(d.rates);
    setLastSync(new Date());
  };

  useEffect(() => {
    // Subscribe to real-time updates from Firestore.
    const unsub = onSnapshot(DATA_REF, (snap) => {
      applySnapshot(snap.data() || {});
      setLoading(false);
    }, (err) => {
      console.error("Firestore error", err);
      setLoading(false);
    });

    // Fetch live exchange rates once on mount.
    fetchRates().then((live) => { if (live) save({ rates: live }); });

    return unsub;
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const snap = await getDoc(DATA_REF);
      applySnapshot(snap.data() || {});
    } catch (e) {
      console.error("sync failed", e);
    }
    setSyncing(false);
  };

  const refreshRates = async () => {
    setRefreshing(true);
    const live = await fetchRates();
    if (live) save({ rates: live });
    setRefreshing(false);
  };

  const toCad = (amount, cur) => (Number(amount) || 0) * (rates[cur] || 1);

  const persist = (next) => { setExpenses(next); save({ expenses: next }); };

  const addOrUpdate = (exp) => {
    if (exp.id) persist(expenses.map((e) => (e.id === exp.id ? exp : e)));
    else persist([{ ...exp, id: Date.now().toString(), created: Date.now() }, ...expenses]);
    setShowForm(false); setEditing(null);
  };
  const remove = (id) => persist(expenses.filter((e) => e.id !== id));

  const persistSettle = (next) => { setSettlements(next); save({ settlements: next }); };
  const addSettlement = (s) => {
    persistSettle([{ ...s, id: Date.now().toString(), created: Date.now() }, ...settlements]);
    setShowSettle(false);
  };
  const removeSettlement = (id) => persistSettle(settlements.filter((s) => s.id !== id));

  // ---- Balance maths, all in CAD. positive => B owes A ----
  const balance = useMemo(() => {
    let net = 0;
    for (const e of expenses) {
      const cad = toCad(e.amount, e.currency);
      const shareA = e.split === "custom" ? toCad(e.shareA, e.currency) : cad / 2;
      const shareB = cad - shareA;
      if (e.payer === "a") net += shareB; else net -= shareA;
    }
    // A settlement is one partner paying the other, which reduces what they owe.
    for (const s of settlements) {
      const cad = toCad(s.amount, s.currency);
      if (s.from === "b") net -= cad;  // B paid A, so B owes A less
      else net += cad;                  // A paid B, so the debt swings the other way
    }
    return net;
  }, [expenses, settlements, rates]);

  const totals = useMemo(() => {
    let paidA = 0, paidB = 0, total = 0;
    for (const e of expenses) {
      const cad = toCad(e.amount, e.currency);
      total += cad;
      if (e.payer === "a") paidA += cad; else paidB += cad;
    }
    return { paidA, paidB, total };
  }, [expenses, rates]);

  const byCategory = useMemo(() => {
    const m = {};
    for (const e of expenses) m[e.category] = (m[e.category] || 0) + toCad(e.amount, e.currency);
    return Object.entries(m).sort((x, y) => y[1] - x[1]);
  }, [expenses, rates]);

  const exportCsv = () => {
    const head = ["Date", "Description", "Category", "Original amount", "Currency", "Amount (CAD)", "Paid by", "Split"];
    const rows = expenses.map((e) => [
      new Date(e.created).toLocaleDateString("en-IE"),
      (e.description || "").replace(/,/g, " "),
      e.category,
      (Number(e.amount) || 0).toFixed(2),
      e.currency,
      toCad(e.amount, e.currency).toFixed(2),
      e.payer === "a" ? names.a : names.b,
      e.split === "custom" ? "Custom" : "50/50",
    ].join(","));
    const csv = [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "shared-expenses.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={S.shell}><div style={{ ...S.card, textAlign: "center", color: "#8a857c" }}>Loading your expenses…</div></div>;

  const owes = balance > 0.005 ? `${names.b} owes ${names.a}` : balance < -0.005 ? `${names.a} owes ${names.b}` : "All square";

  return (
    <div style={S.shell}>
      <style>{`
        * { box-sizing: border-box; }
        .ex-btn:hover { filter: brightness(1.07); }
        .ex-row:hover { background:#fbf9f4; }
        .ex-icon:hover { color:#b5505a; }
        input:focus, select:focus, textarea:focus { outline:2px solid #5b8c6e; outline-offset:1px; }
        .spin { animation: sp 0.9s linear infinite; } @keyframes sp { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce){ *{transition:none!important; animation:none!important} }
      `}</style>

      <header style={S.header}>
        <div>
          <div style={S.kicker}>Shared expenses</div>
          <h1 style={S.h1}>{names.a} &amp; {names.b}</h1>
        </div>
        <button className="ex-btn" style={S.ghostBtn} onClick={() => setEditNames(true)}><Users size={15} /> Names</button>
      </header>

      <div style={{ ...S.card, ...S.banner }}>
        <Scale size={26} style={{ opacity: 0.5 }} />
        <div>
          <div style={S.bannerLabel}>{owes}</div>
          <div style={S.bannerAmount}>{Math.abs(balance) < 0.005 ? "Nothing owed" : fmtCad(Math.abs(balance))}</div>
        </div>
      </div>

      <div style={S.tabs}>
        {[["balance", "Overview"], ["list", "Expenses"], ["summary", "Summary"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...S.tab, ...(tab === k ? S.tabActive : {}) }}>{label}</button>
        ))}
      </div>

      {tab === "balance" && (
        <div style={S.card}>
          <Stat label={`${names.a} paid`} value={fmtCad(totals.paidA)} />
          <Stat label={`${names.b} paid`} value={fmtCad(totals.paidB)} />
          <Stat label="Total spent together" value={fmtCad(totals.total)} strong />
          <div style={S.owedBlock}>
            <OwedLine name={names.a} net={balance} />
            <OwedLine name={names.b} net={-balance} />
          </div>
          <div style={S.rateBar}>
            <span style={{ color: "#9a958c", fontSize: 12 }}>
              US$1 = {fmtCad(rates.USD)} · €1 = {fmtCad(rates.EUR)}<br />
              <span style={{ fontSize: 11 }}>Rates as of {rates.asOf}</span>
            </span>
            <button className="ex-btn" style={S.miniBtn} onClick={refreshRates} disabled={refreshing}>
              <RefreshCw size={13} className={refreshing ? "spin" : ""} /> {refreshing ? "Updating" : "Refresh"}
            </button>
          </div>
          <p style={S.hint}>Everything is converted to CAD so the balance is correct whatever currency you spend in. The original amount is kept on each expense.</p>
        </div>
      )}

      {tab === "list" && (
        <div style={S.card}>
          {expenses.length === 0 ? (
            <div style={S.empty}><Receipt size={28} style={{ opacity: 0.4 }} /><p>No expenses yet. Add your first one below.</p></div>
          ) : expenses.map((e) => {
            const cad = toCad(e.amount, e.currency);
            const foreign = e.currency !== "CAD";
            return (
              <div key={e.id} className="ex-row" style={S.row}>
                <div style={{ ...S.dot, background: CAT_COLOUR[e.category] || "#7d7d7d" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.rowTitle}>{e.description || e.category}</div>
                  <div style={S.rowMeta}>{e.category} · {(e.payer === "a" ? names.a : names.b)} paid · {e.split === "custom" ? "custom split" : "50/50"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={S.rowAmt}>{fmtCad(cad)}</div>
                  {foreign && <div style={S.rowOrig}>{fmtCur(e.amount, e.currency)}</div>}
                </div>
                <Pencil size={15} className="ex-icon" style={S.act} onClick={() => { setEditing(e); setShowForm(true); }} />
                <Trash2 size={15} className="ex-icon" style={S.act} onClick={() => remove(e.id)} />
              </div>
            );
          })}
          {settlements.length > 0 && (
            <>
              <div style={S.sectLabel}>Payments between you</div>
              {settlements.map((s) => {
                const cad = toCad(s.amount, s.currency);
                const foreign = s.currency !== "CAD";
                const fromName = s.from === "a" ? names.a : names.b;
                const toName = s.from === "a" ? names.b : names.a;
                return (
                  <div key={s.id} className="ex-row" style={S.row}>
                    <div style={S.settleDot}><HandCoins size={13} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.rowTitle}>{fromName} <ArrowRight size={11} style={{ verticalAlign: "middle", opacity: 0.5 }} /> {toName}</div>
                      <div style={S.rowMeta}>Payment{s.note ? " · " + s.note : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ ...S.rowAmt, color: "#4a7a99" }}>{fmtCad(cad)}</div>
                      {foreign && <div style={S.rowOrig}>{fmtCur(s.amount, s.currency)}</div>}
                    </div>
                    <Trash2 size={15} className="ex-icon" style={S.act} onClick={() => removeSettlement(s.id)} />
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === "summary" && (
        <div style={S.card}>
          {byCategory.length === 0 ? <div style={S.empty}><p>Nothing to summarise yet.</p></div> : (
            <>
              {byCategory.map(([cat, val]) => {
                const pct = totals.total ? (val / totals.total) * 100 : 0;
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={S.sumRow}><span>{cat}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCad(val)}</span></div>
                    <div style={S.barTrack}><div style={{ ...S.barFill, width: pct + "%", background: CAT_COLOUR[cat] }} /></div>
                  </div>
                );
              })}
              <button className="ex-btn" style={{ ...S.ghostBtn, marginTop: 8 }} onClick={exportCsv}><Download size={15} /> Export to spreadsheet</button>
            </>
          )}
        </div>
      )}

      <div style={S.btnRow}>
        <button className="ex-btn" style={S.fab} onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={18} /> Add expense</button>
        <button className="ex-btn" style={S.settleBtn} onClick={() => setShowSettle(true)}><HandCoins size={17} /> Settle up</button>
      </div>

      {showForm && <ExpenseForm names={names} rates={rates} initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={addOrUpdate} />}
      {showSettle && <SettleForm names={names} balance={balance} rates={rates} onClose={() => setShowSettle(false)} onSave={addSettlement} />}
      {editNames && <NamesForm names={names} onClose={() => setEditNames(false)} onSave={(n) => { setNames(n); save({ names: n }); setEditNames(false); }} />}

      <div style={S.syncBar}>
        <button className="ex-btn" style={S.miniBtn} onClick={syncNow} disabled={syncing}>
          <RefreshCw size={13} className={syncing ? "spin" : ""} /> {syncing ? "Syncing…" : "Sync now"}
        </button>
        {lastSync && <span style={{ fontSize: 11, color: "#b3aea3" }}>Last synced {lastSync.toLocaleTimeString()}</span>}
      </div>
      <p style={S.footnote}>Synced in real-time between you both.</p>
    </div>
  );
}

function Stat({ label, value, strong }) {
  return <div style={S.statRow}><span style={{ color: "#8a857c" }}>{label}</span><span style={{ fontVariantNumeric: "tabular-nums", fontWeight: strong ? 700 : 500, fontSize: strong ? 18 : 15 }}>{value}</span></div>;
}

function OwedLine({ name, net }) {
  const owed = net > 0.005;
  const owing = net < -0.005;
  const label = owed ? "is owed" : owing ? "owes" : "settled up";
  const colour = owed ? "#5b8c6e" : owing ? "#c97b4a" : "#9a958c";
  return (
    <div style={S.owedRow}>
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ color: colour, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {label}{(owed || owing) ? " " + fmtCad(Math.abs(net)) : ""}
      </span>
    </div>
  );
}

function ExpenseForm({ names, rates, initial, onClose, onSave }) {
  const [amount, setAmount] = useState(initial?.amount || "");
  const [currency, setCurrency] = useState(initial?.currency || "CAD");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || CATEGORIES[0]);
  const [payer, setPayer] = useState(initial?.payer || "a");
  const [split, setSplit] = useState(initial?.split || "even");
  const [shareA, setShareA] = useState(initial?.shareA ?? "");

  const amt = Number(amount) || 0;
  const a = split === "custom" ? (Number(shareA) || 0) : amt / 2;
  const cad = amt * (rates[currency] || 1);

  const submit = () => {
    if (!amt) return;
    onSave({ id: initial?.id, created: initial?.created, amount: amt, currency, description: description.trim(), category, payer, split, shareA: split === "custom" ? Number(shareA) || 0 : null });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}><h2 style={S.h2}>{initial ? "Edit expense" : "New expense"}</h2><X size={18} style={{ cursor: "pointer", color: "#8a857c" }} onClick={onClose} /></div>

        <label style={S.lbl}>Amount</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} style={{ ...S.input, flex: 1 }} autoFocus />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...S.input, width: 96 }}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {currency !== "CAD" && amt > 0 && <div style={S.convNote}>≈ {fmtCad(cad)} in CAD</div>}

        <label style={S.lbl}>Description</label>
        <input value={description} placeholder="e.g. Weekly shop" onChange={(e) => setDescription(e.target.value)} style={S.input} />

        <label style={S.lbl}>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={S.input}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>

        <label style={S.lbl}>Who paid?</label>
        <div style={S.seg}>
          <button onClick={() => setPayer("a")} style={{ ...S.segBtn, ...(payer === "a" ? S.segOn : {}) }}>{names.a}</button>
          <button onClick={() => setPayer("b")} style={{ ...S.segBtn, ...(payer === "b" ? S.segOn : {}) }}>{names.b}</button>
        </div>

        <label style={S.lbl}>How is it split?</label>
        <div style={S.seg}>
          <button onClick={() => setSplit("even")} style={{ ...S.segBtn, ...(split === "even" ? S.segOn : {}) }}>50/50</button>
          <button onClick={() => setSplit("custom")} style={{ ...S.segBtn, ...(split === "custom" ? S.segOn : {}) }}>Custom</button>
        </div>

        {split === "custom" && (
          <>
            <label style={S.lbl}>{names.a}'s share (in {currency})</label>
            <input type="number" inputMode="decimal" value={shareA} placeholder="0.00" onChange={(e) => setShareA(e.target.value)} style={S.input} />
            <div style={S.splitNote}>{names.a}: {fmtCur(a, currency)} · {names.b}: {fmtCur(Math.max(0, amt - a), currency)}</div>
          </>
        )}

        <button className="ex-btn" style={S.saveBtn} onClick={submit} disabled={!amt}>{initial ? "Save changes" : "Add expense"}</button>
      </div>
    </div>
  );
}

function SettleForm({ names, balance, rates, onClose, onSave }) {
  const owedDir = balance > 0.005 ? "b" : balance < -0.005 ? "a" : "b";
  const [from, setFrom] = useState(owedDir);
  const [amount, setAmount] = useState(Math.abs(balance) > 0.005 ? Math.abs(balance).toFixed(2) : "");
  const [currency, setCurrency] = useState("CAD");
  const [note, setNote] = useState("");

  const amt = Number(amount) || 0;
  const cad = amt * (rates[currency] || 1);
  const toName = from === "a" ? names.b : names.a;

  const submit = () => {
    if (!amt) return;
    onSave({ from, currency, amount: amt, note: note.trim() });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}><h2 style={S.h2}>Settle up</h2><X size={18} style={{ cursor: "pointer", color: "#8a857c" }} onClick={onClose} /></div>
        <p style={{ ...S.hint, marginTop: 0 }}>Record one of you paying the other back. It adjusts the balance straight away.</p>

        <label style={S.lbl}>Who paid?</label>
        <div style={S.seg}>
          <button onClick={() => setFrom("a")} style={{ ...S.segBtn, ...(from === "a" ? S.segOn : {}) }}>{names.a}</button>
          <button onClick={() => setFrom("b")} style={{ ...S.segBtn, ...(from === "b" ? S.segOn : {}) }}>{names.b}</button>
        </div>
        <div style={S.splitNote}>Paying {toName}</div>

        <label style={S.lbl}>Amount</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} style={{ ...S.input, flex: 1 }} autoFocus />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...S.input, width: 96 }}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        {currency !== "CAD" && amt > 0 && <div style={S.convNote}>≈ {fmtCad(cad)} in CAD</div>}

        <label style={S.lbl}>Note (optional)</label>
        <input value={note} placeholder="e.g. e-transfer" onChange={(e) => setNote(e.target.value)} style={S.input} />

        <button className="ex-btn" style={S.saveBtn} onClick={submit} disabled={!amt}>Record payment</button>
      </div>
    </div>
  );
}

function NamesForm({ names, onClose, onSave }) {
  const [a, setA] = useState(names.a);
  const [b, setB] = useState(names.b);
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}><h2 style={S.h2}>Your names</h2><X size={18} style={{ cursor: "pointer", color: "#8a857c" }} onClick={onClose} /></div>
        <label style={S.lbl}>First person</label>
        <input value={a} onChange={(e) => setA(e.target.value)} style={S.input} />
        <label style={S.lbl}>Second person</label>
        <input value={b} onChange={(e) => setB(e.target.value)} style={S.input} />
        <button className="ex-btn" style={S.saveBtn} onClick={() => onSave({ a: a.trim() || "Me", b: b.trim() || "Partner" })}>Save</button>
      </div>
    </div>
  );
}

const S = {
  shell: { maxWidth: 480, margin: "0 auto", padding: "20px 16px 60px", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#2c2a26" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5b8c6e", fontWeight: 700 },
  h1: { fontSize: 26, margin: "2px 0 0", fontWeight: 700, letterSpacing: "-0.02em" },
  card: { background: "#fff", border: "1px solid #ece7dd", borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: "0 1px 2px rgba(60,50,30,0.04)" },
  banner: { display: "flex", alignItems: "center", gap: 16, background: "#2f4538", color: "#f3efe6", border: "none" },
  bannerLabel: { fontSize: 13, opacity: 0.8 },
  bannerAmount: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
  tabs: { display: "flex", gap: 6, marginBottom: 14 },
  tab: { flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #ece7dd", background: "#fff", color: "#8a857c", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tabActive: { background: "#2f4538", color: "#fff", borderColor: "#2f4538" },
  statRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1ede4", fontSize: 15 },
  rateBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1ede4", lineHeight: 1.5 },
  owedBlock: { marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1ede4", display: "flex", flexDirection: "column", gap: 8 },
  owedRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 },
  miniBtn: { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd6c9", background: "#fff", color: "#5a554c", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 },
  hint: { fontSize: 12.5, color: "#9a958c", marginTop: 14, lineHeight: 1.5 },
  empty: { textAlign: "center", color: "#a39e94", padding: "30px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 14 },
  row: { display: "flex", alignItems: "center", gap: 12, padding: "11px 6px", borderRadius: 10, borderBottom: "1px solid #f4f0e8" },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  rowTitle: { fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  rowMeta: { fontSize: 12, color: "#9a958c", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  rowAmt: { fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 15 },
  rowOrig: { fontSize: 11.5, color: "#a39e94", fontVariantNumeric: "tabular-nums", marginTop: 1 },
  act: { cursor: "pointer", color: "#c4bfb4", flexShrink: 0 },
  sumRow: { display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 6 },
  barTrack: { height: 8, background: "#f1ede4", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  fab: { flex: 1, padding: "14px", borderRadius: 14, border: "none", background: "#c97b4a", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  btnRow: { display: "flex", gap: 8, marginBottom: 14 },
  settleBtn: { padding: "14px 16px", borderRadius: 14, border: "1px solid #4a7a99", background: "#fff", color: "#4a7a99", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap" },
  settleDot: { width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "#e6eef3", color: "#4a7a99", display: "flex", alignItems: "center", justifyContent: "center" },
  sectLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#a39e94", fontWeight: 700, margin: "16px 0 4px", paddingTop: 12, borderTop: "1px solid #f1ede4" },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", color: "#5a554c", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  syncBar: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 },
  footnote: { textAlign: "center", fontSize: 11.5, color: "#b3aea3", marginTop: 4 },
  overlay: { position: "fixed", inset: 0, background: "rgba(40,35,25,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  modal: { background: "#faf8f3", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 22, maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  h2: { fontSize: 19, fontWeight: 700, margin: 0 },
  lbl: { display: "block", fontSize: 12.5, fontWeight: 600, color: "#7a756c", margin: "12px 0 5px" },
  input: { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", fontSize: 15, fontFamily: "inherit", color: "#2c2a26" },
  convNote: { fontSize: 13, color: "#5b8c6e", fontWeight: 600, marginTop: 8 },
  seg: { display: "flex", gap: 6 },
  segBtn: { flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", color: "#7a756c", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  segOn: { background: "#2f4538", color: "#fff", borderColor: "#2f4538" },
  splitNote: { fontSize: 12.5, color: "#8a857c", marginTop: 8 },
  saveBtn: { width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#5b8c6e", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 20 },
};
