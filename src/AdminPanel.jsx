import React, { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from "firebase/firestore";
import { X, UserPlus, Trash2, Shield } from "lucide-react";

const ADMIN_EMAIL = "finnt3@gmail.com";
const ALLOWED_REF = doc(db, "shared", "allowedUsers");

export function isAdmin(user) {
  return user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Call this after sign-in to check if user is allowed.
export async function checkAllowed(user) {
  if (isAdmin(user)) return true;
  try {
    const snap = await getDoc(ALLOWED_REF);
    const list = snap.data()?.emails || [];
    return list.map((e) => e.toLowerCase()).includes(user.email.toLowerCase());
  } catch (e) {
    return false;
  }
}

const S = {
  overlay: { position: "fixed", inset: 0, background: "rgba(40,35,25,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  modal: { background: "#faf8f3", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 22, maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  h2: { fontSize: 19, fontWeight: 700, margin: 0, color: "#2c2a26" },
  lbl: { display: "block", fontSize: 12.5, fontWeight: 600, color: "#7a756c", margin: "14px 0 5px" },
  input: { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", fontSize: 15, fontFamily: "inherit", color: "#2c2a26", boxSizing: "border-box" },
  addRow: { display: "flex", gap: 8, marginTop: 6 },
  addBtn: { padding: "11px 16px", borderRadius: 10, border: "none", background: "#5b8c6e", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 },
  userRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid #ece7dd", marginBottom: 8 },
  email: { fontSize: 14, color: "#2c2a26", fontWeight: 500 },
  badge: { fontSize: 11, background: "#2f4538", color: "#fff", borderRadius: 6, padding: "2px 7px", fontWeight: 700 },
  removeBtn: { background: "none", border: "none", cursor: "pointer", color: "#c4bfb4", padding: 4 },
  empty: { textAlign: "center", color: "#a39e94", fontSize: 14, padding: "20px 0" },
  hint: { fontSize: 12, color: "#9a958c", marginTop: 10, lineHeight: 1.5 },
};

export default function AdminPanel({ onClose }) {
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(ALLOWED_REF, (snap) => {
      setEmails(snap.data()?.emails || []);
    });
    return unsub;
  }, []);

  const add = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { setError("Enter a valid email address."); return; }
    if (email === ADMIN_EMAIL.toLowerCase()) { setError("You're already the admin."); return; }
    if (emails.map((e) => e.toLowerCase()).includes(email)) { setError("That email is already on the list."); return; }
    setError("");
    await setDoc(ALLOWED_REF, { emails: arrayUnion(email) }, { merge: true });
    setNewEmail("");
  };

  const remove = async (email) => {
    await updateDoc(ALLOWED_REF, { emails: arrayRemove(email) });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={18} style={{ color: "#5b8c6e" }} />
            <h2 style={S.h2}>Manage access</h2>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#8a857c" }} onClick={onClose} />
        </div>

        <div style={S.userRow}>
          <span style={S.email}>{ADMIN_EMAIL}</span>
          <span style={S.badge}>Admin</span>
        </div>

        {emails.length === 0 ? (
          <div style={S.empty}>No other users yet.</div>
        ) : emails.map((email) => (
          <div key={email} style={S.userRow}>
            <span style={S.email}>{email}</span>
            <button style={S.removeBtn} onClick={() => remove(email)} title="Remove access">
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        <label style={S.lbl}>Add a user by email</label>
        <div style={S.addRow}>
          <input
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="partner@example.com"
            style={S.input}
            type="email"
          />
          <button style={S.addBtn} onClick={add}><UserPlus size={15} /> Add</button>
        </div>
        {error && <div style={{ color: "#b5505a", fontSize: 13, marginTop: 8 }}>{error}</div>}
        <p style={S.hint}>Only people on this list can sign in. Add your partner's email here before they create an account.</p>
      </div>
    </div>
  );
}
