import React, { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot, collection, deleteDoc } from "firebase/firestore";
import { X, UserPlus, Trash2, Shield, Users } from "lucide-react";

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

const TYPE_COLOUR = { single: "#4a7a99", duo: "#5b8c6e", multi: "#c97b4a" };
const TYPE_LABEL = { single: "Single", duo: "Duo", multi: "Multi" };

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
  // Tab styles
  tabRow: { display: "flex", gap: 6, marginBottom: 18 },
  tab: { flex: 1, padding: "9px 0", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", color: "#7a756c", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabActive: { flex: 1, padding: "9px 0", borderRadius: 10, border: "none", background: "#2f4538", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  // Room card styles
  roomCard: { background: "#fff", border: "1px solid #ece7dd", borderRadius: 12, padding: "12px 14px", marginBottom: 10 },
  roomCardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  roomName: { fontWeight: 700, fontSize: 15, color: "#2c2a26", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  roomMeta: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  typeBadge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", letterSpacing: 0.3 },
  metaText: { fontSize: 12, color: "#9a958c" },
  membersList: { display: "flex", flexDirection: "column", gap: 4 },
  memberRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderRadius: 8, background: "#faf8f3" },
  memberEmail: { fontSize: 13, color: "#5a554c" },
  deleteRoomBtn: { padding: "4px 10px", borderRadius: 8, border: "none", background: "#b5505a", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 },
  removeMemberBtn: { background: "none", border: "none", cursor: "pointer", color: "#c4bfb4", padding: "2px 4px" },
  countBadge: { fontSize: 12, fontWeight: 600, color: "#7a756c", background: "#f0ece3", border: "1px solid #ece7dd", borderRadius: 8, padding: "4px 10px", marginBottom: 14, display: "inline-block" },
  confirmOverlay: { position: "fixed", inset: 0, background: "rgba(40,35,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 },
  confirmBox: { background: "#faf8f3", borderRadius: 16, padding: 22, maxWidth: 340, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" },
  confirmBtns: { display: "flex", gap: 8, marginTop: 18 },
  confirmDeleteBtn: { flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "#b5505a", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  confirmCancelBtn: { flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", color: "#5a554c", fontSize: 14, fontWeight: 700, cursor: "pointer" },
};

export default function AdminPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState("users");

  // Users tab state
  const [emails, setEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");

  // Rooms tab state
  const [rooms, setRooms] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null); // { roomId, roomName }

  useEffect(() => {
    const unsub = onSnapshot(ALLOWED_REF, (snap) => {
      setEmails(snap.data()?.emails || []);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "rooms"), (snap) => {
      setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  const handleDeleteRoom = async (roomId) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const members = room.members || [];
    await Promise.all(members.map(async (m) => {
      const mRef = doc(db, "users", m.uid);
      await updateDoc(mRef, {
        memberRooms: arrayRemove(roomId),
        createdRooms: arrayRemove(roomId),
      }).catch(() => {});
    }));
    await deleteDoc(doc(db, "rooms", roomId));
    setConfirmDelete(null);
  };

  const handleRemoveMember = async (room, member) => {
    const newMembers = (room.members || []).filter((m) => m.uid !== member.uid);
    await updateDoc(doc(db, "rooms", room.id), { members: newMembers });
    await updateDoc(doc(db, "users", member.uid), {
      memberRooms: arrayRemove(room.id),
    }).catch(() => {});
  };

  const getCreatorEmail = (room) => {
    const creator = (room.members || []).find((m) => m.uid === room.createdBy);
    return creator?.email || room.createdBy || "unknown";
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

        {/* Tab switcher */}
        <div style={S.tabRow}>
          <button
            style={activeTab === "users" ? S.tabActive : S.tab}
            onClick={() => setActiveTab("users")}
          >
            Users
          </button>
          <button
            style={activeTab === "rooms" ? S.tabActive : S.tab}
            onClick={() => setActiveTab("rooms")}
          >
            Rooms
          </button>
        </div>

        {activeTab === "users" && (
          <>
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
          </>
        )}

        {activeTab === "rooms" && (
          <>
            <div style={S.countBadge}>{rooms.length} room{rooms.length !== 1 ? "s" : ""} total</div>

            {rooms.length === 0 ? (
              <div style={S.empty}>No rooms yet.</div>
            ) : rooms.map((room) => {
              const typeColour = TYPE_COLOUR[room.type] || "#7d7d7d";
              const members = room.members || [];
              const expenseCount = (room.expenses || []).length;
              const creatorEmail = getCreatorEmail(room);

              return (
                <div key={room.id} style={S.roomCard}>
                  <div style={S.roomCardHead}>
                    <span style={S.roomName}>{room.name}</span>
                    <button
                      style={S.deleteRoomBtn}
                      onClick={() => setConfirmDelete({ roomId: room.id, roomName: room.name })}
                      title="Delete room"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                  <div style={S.roomMeta}>
                    <span style={{ ...S.typeBadge, background: typeColour + "18", color: typeColour }}>
                      {TYPE_LABEL[room.type] || room.type}
                    </span>
                    <span style={S.metaText}>{members.length} member{members.length !== 1 ? "s" : ""}</span>
                    <span style={S.metaText}>{expenseCount} expense{expenseCount !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#9a958c", marginBottom: 8 }}>
                    Created by: <span style={{ color: "#5a554c", fontWeight: 600 }}>{creatorEmail}</span>
                  </div>
                  <div style={S.membersList}>
                    {members.map((m) => (
                      <div key={m.uid} style={S.memberRow}>
                        <span style={S.memberEmail}>{m.email || m.uid}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {m.uid === room.createdBy && (
                            <span style={{ fontSize: 10, background: "#2f4538", color: "#fff", borderRadius: 5, padding: "1px 6px", fontWeight: 700 }}>Owner</span>
                          )}
                          {m.uid !== room.createdBy && (
                            <button
                              style={S.removeMemberBtn}
                              onClick={() => handleRemoveMember(room, m)}
                              title="Remove from room"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {confirmDelete && (
        <div style={S.confirmOverlay} onClick={() => setConfirmDelete(null)}>
          <div style={S.confirmBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ ...S.h2, marginBottom: 10 }}>Delete room?</h2>
            <p style={{ color: "#5a554c", fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              Delete <strong>"{confirmDelete.roomName}"</strong>? This cannot be undone and will remove it for all members.
            </p>
            <div style={S.confirmBtns}>
              <button style={S.confirmDeleteBtn} onClick={() => handleDeleteRoom(confirmDelete.roomId)}>Delete</button>
              <button style={S.confirmCancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
