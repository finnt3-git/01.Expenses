import React, { useState } from "react";
import { X, Plus, UserPlus } from "lucide-react";
import { db } from "./firebase";
import {
  collection, doc, addDoc, setDoc, getDoc, query, where, getDocs,
  serverTimestamp, arrayUnion,
} from "firebase/firestore";

const CREATED_LIMIT = 5;

export default function CreateRoomForm({ user, onClose, onCreated }) {
  const defaultDisplayName = user?.email?.split("@")[0] || "";

  const [name, setName] = useState("");
  const [type, setType] = useState("duo");
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [invites, setInvites] = useState([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maxInvites = type === "duo" ? 1 : 7;

  const handleTypeChange = (t) => {
    setType(t);
    if (t === "single") setInvites([]);
    else if (t === "duo") setInvites([""]);
    else setInvites([""]);
  };

  const addInviteField = () => {
    if (invites.length < maxInvites) setInvites([...invites, ""]);
  };

  const updateInvite = (i, val) => {
    const next = [...invites];
    next[i] = val;
    setInvites(next);
  };

  const removeInvite = (i) => {
    setInvites(invites.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Room name is required."); return; }
    if (!displayName.trim()) { setError("Display name is required."); return; }

    setSubmitting(true);
    setError("");

    try {
      // Check created room limit
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const existingCreated = userSnap.exists() ? (userSnap.data().createdRooms || []) : [];
      if (existingCreated.length >= CREATED_LIMIT) {
        setError(`You can only create up to ${CREATED_LIMIT} rooms.`);
        setSubmitting(false);
        return;
      }

      const dn = displayName.trim();
      const initialMembers = [{ uid: user.uid, email: user.email, displayName: dn }];

      // Create room doc
      const roomsRef = collection(db, "rooms");
      const roomDoc = await addDoc(roomsRef, {
        name: name.trim(),
        type,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        members: initialMembers,
        expenses: [],
        settlements: [],
        rates: null,
        names: { [user.uid]: dn },
        pendingInvites: [],
      });
      const roomId = roomDoc.id;

      // Update creator's user doc
      await setDoc(userRef, {
        email: user.email,
        createdRooms: arrayUnion(roomId),
        memberRooms: arrayUnion(roomId),
      }, { merge: true });

      // Process invites
      const filteredInvites = invites.map((e) => e.trim().toLowerCase()).filter(Boolean);

      if (filteredInvites.length > 0) {
        const pendingInvites = [];

        await Promise.all(filteredInvites.map(async (email) => {
          // Look up user by email
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", email));
          const qSnap = await getDocs(q);

          if (!qSnap.empty) {
            const invitedDoc = qSnap.docs[0];
            const invitedUid = invitedDoc.id;
            const invitedData = invitedDoc.data();

            // Add to room members
            const newMember = {
              uid: invitedUid,
              email: invitedData.email,
              displayName: invitedData.displayName || email.split("@")[0],
            };
            await setDoc(doc(db, "rooms", roomId), {
              members: arrayUnion(newMember),
            }, { merge: true });

            // Add room to their memberRooms
            await setDoc(doc(db, "users", invitedUid), {
              memberRooms: arrayUnion(roomId),
            }, { merge: true });
          } else {
            pendingInvites.push(email);
          }
        }));

        if (pendingInvites.length > 0) {
          await setDoc(doc(db, "rooms", roomId), { pendingInvites }, { merge: true });
        }
      }

      onCreated(roomId);
    } catch (e) {
      console.error("CreateRoomForm error", e);
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <h2 style={S.h2}>New room</h2>
          <X size={18} style={{ cursor: "pointer", color: "#8a857c" }} onClick={onClose} />
        </div>

        <label style={S.lbl}>Room name</label>
        <input
          style={S.input}
          value={name}
          placeholder="e.g. Toronto trip"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label style={S.lbl}>Room type</label>
        <div style={S.seg}>
          {["single", "duo", "multi"].map((t) => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              style={{ ...S.segBtn, ...(type === t ? { ...S.segOn, background: TYPE_BG[t], borderColor: TYPE_BG[t] } : {}) }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#9a958c", marginTop: 6, lineHeight: 1.4 }}>
          {type === "single" && "Just for you — track your own expenses."}
          {type === "duo" && "You and one other person."}
          {type === "multi" && "A group of 3–8 people."}
        </div>

        <label style={S.lbl}>Your display name in this room</label>
        <input
          style={S.input}
          value={displayName}
          placeholder="Your name"
          onChange={(e) => setDisplayName(e.target.value)}
        />

        {(type === "duo" || type === "multi") && (
          <>
            <label style={S.lbl}>
              {type === "duo" ? "Invite partner (email)" : "Invite people (email)"}
            </label>
            {invites.map((inv, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  type="email"
                  value={inv}
                  placeholder={`Email ${i + 1}`}
                  onChange={(e) => updateInvite(i, e.target.value)}
                />
                {(type === "multi" && invites.length > 1) && (
                  <button style={S.iconBtn} onClick={() => removeInvite(i)} title="Remove">
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            {type === "multi" && invites.length < maxInvites && (
              <button
                style={S.addInviteBtn}
                onClick={addInviteField}
              >
                <UserPlus size={14} /> Add another person
              </button>
            )}
            <div style={{ fontSize: 12, color: "#9a958c", marginTop: 6 }}>
              If they haven't signed up yet, they'll be added when they join.
            </div>
          </>
        )}

        {error && <div style={S.errorMsg}>{error}</div>}

        <button
          style={{ ...S.saveBtn, opacity: submitting ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Creating…" : "Create room"}
        </button>
      </div>
    </div>
  );
}

const TYPE_BG = { single: "#4a7a99", duo: "#5b8c6e", multi: "#c97b4a" };

const S = {
  overlay: { position: "fixed", inset: 0, background: "rgba(40,35,25,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  modal: { background: "#faf8f3", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 22, maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  h2: { fontSize: 19, fontWeight: 700, margin: 0 },
  lbl: { display: "block", fontSize: 12.5, fontWeight: 600, color: "#7a756c", margin: "14px 0 5px" },
  input: { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", fontSize: 15, fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#2c2a26" },
  seg: { display: "flex", gap: 6 },
  segBtn: { flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", color: "#7a756c", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  segOn: { color: "#fff" },
  iconBtn: { padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", color: "#9a958c", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 },
  addInviteBtn: { display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4, padding: "8px 12px", borderRadius: 10, border: "1px dashed #c8bfaf", background: "transparent", color: "#7a756c", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  errorMsg: { marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#fdf0ee", border: "1px solid #e8b4ae", color: "#b5505a", fontSize: 13.5, fontWeight: 500 },
  saveBtn: { width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#5b8c6e", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 20 },
};
