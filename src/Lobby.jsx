import React, { useState, useEffect } from "react";
import { Plus, X, Users, User, UserPlus, Shield, LogOut, Trash2, DoorOpen } from "lucide-react";
import { db } from "./firebase";
import { doc, getDoc, onSnapshot, setDoc, deleteDoc, arrayUnion, arrayRemove, updateDoc } from "firebase/firestore";
import CreateRoomForm from "./CreateRoomForm";

const CREATED_LIMIT = 5;
const MEMBER_LIMIT = 10;

const TYPE_COLOUR = { single: "#4a7a99", duo: "#5b8c6e", multi: "#c97b4a" };
const TYPE_LABEL = { single: "Single", duo: "Duo", multi: "Multi" };

export default function Lobby({ user, onEnterRoom, onSignOut, onAdmin }) {
  const [rooms, setRooms] = useState([]);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // roomId

  // Load user doc then subscribe to each room
  useEffect(() => {
    if (!user) return;
    let roomUnsubs = [];

    const userRef = doc(db, "users", user.uid);
    const unsubUser = onSnapshot(userRef, async (snap) => {
      const data = snap.data() || {};
      setUserDoc(data);

      const createdRooms = data.createdRooms || [];
      const memberRooms = data.memberRooms || [];
      const allIds = [...new Set([...createdRooms, ...memberRooms])];

      // Clean up old room listeners
      roomUnsubs.forEach((u) => u());
      roomUnsubs = [];

      if (allIds.length === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      // We'll collect rooms in a map keyed by id
      const roomMap = {};
      let resolved = 0;

      allIds.forEach((roomId) => {
        const ref = doc(db, "rooms", roomId);
        const unsub = onSnapshot(ref, (rSnap) => {
          if (rSnap.exists()) {
            roomMap[roomId] = { id: roomId, ...rSnap.data() };
          } else {
            delete roomMap[roomId];
          }
          resolved++;
          if (resolved >= allIds.length) setLoading(false);
          setRooms(Object.values(roomMap));
        });
        roomUnsubs.push(unsub);
      });
    });

    return () => {
      unsubUser();
      roomUnsubs.forEach((u) => u());
    };
  }, [user]);

  const createdRooms = (userDoc?.createdRooms || []);
  const memberRooms = (userDoc?.memberRooms || []).filter((id) => !createdRooms.includes(id));

  const myCreatedRooms = rooms.filter((r) => createdRooms.includes(r.id));
  const myMemberRooms = rooms.filter((r) => memberRooms.includes(r.id));

  const handleDelete = async (roomId) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    // Remove roomId from all members' docs
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

  const handleLeave = async (roomId) => {
    const roomRef = doc(db, "rooms", roomId);
    const rSnap = await getDoc(roomRef);
    if (rSnap.exists()) {
      const members = (rSnap.data().members || []).filter((m) => m.uid !== user.uid);
      await setDoc(roomRef, { members }, { merge: true });
    }
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, { memberRooms: arrayRemove(roomId) }).catch(() => {});
  };

  if (loading) {
    return (
      <div style={S.shell}>
        <div style={{ ...S.card, textAlign: "center", color: "#8a857c" }}>Loading your rooms…</div>
      </div>
    );
  }

  return (
    <div style={S.shell}>
      <style>{`
        * { box-sizing: border-box; }
        .lb-btn:hover { filter: brightness(1.07); }
        .lb-card:hover { border-color: #c8bfaf; box-shadow: 0 2px 8px rgba(60,50,30,0.09); }
        input:focus, select:focus { outline: 2px solid #5b8c6e; outline-offset: 1px; }
      `}</style>

      <header style={S.header}>
        <div>
          <div style={S.kicker}>Shared expenses</div>
          <h1 style={S.h1}>Your rooms</h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {user?.email === "finnt3@gmail.com" && (
            <button className="lb-btn" style={S.ghostBtn} onClick={onAdmin} title="Admin panel">
              <Shield size={15} />
            </button>
          )}
          <button className="lb-btn" style={S.ghostBtn} onClick={onSignOut} title={user?.email}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <div style={S.limitsBar}>
        <span style={S.limitChip}>
          {createdRooms.length}/{CREATED_LIMIT} rooms created
        </span>
        <span style={S.limitChip}>
          {(userDoc?.memberRooms || []).length}/{MEMBER_LIMIT} memberships
        </span>
      </div>

      {myCreatedRooms.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <div style={S.sectLabel}>Your rooms</div>
          {myCreatedRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isOwner
              onClick={() => onEnterRoom(room.id, room)}
              onDelete={() => setConfirmDelete(room.id)}
            />
          ))}
        </section>
      )}

      {myMemberRooms.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <div style={S.sectLabel}>Member of</div>
          {myMemberRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              isOwner={false}
              onClick={() => onEnterRoom(room.id, room)}
              onLeave={() => handleLeave(room.id)}
            />
          ))}
        </section>
      )}

      {rooms.length === 0 && (
        <div style={S.empty}>
          <Users size={32} style={{ opacity: 0.3 }} />
          <p>No rooms yet. Create one to get started.</p>
        </div>
      )}

      <button
        className="lb-btn"
        style={{
          ...S.fab,
          opacity: createdRooms.length >= CREATED_LIMIT ? 0.5 : 1,
          cursor: createdRooms.length >= CREATED_LIMIT ? "not-allowed" : "pointer",
        }}
        onClick={() => createdRooms.length < CREATED_LIMIT && setShowCreate(true)}
        disabled={createdRooms.length >= CREATED_LIMIT}
      >
        <Plus size={18} /> New room
      </button>

      {showCreate && (
        <CreateRoomForm
          user={user}
          onClose={() => setShowCreate(false)}
          onCreated={(roomId) => {
            setShowCreate(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message="Delete this room? This cannot be undone and will remove it for all members."
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function RoomCard({ room, isOwner, onClick, onDelete, onLeave }) {
  const typeColour = TYPE_COLOUR[room.type] || "#7d7d7d";
  const memberCount = (room.members || []).length;

  return (
    <div
      className="lb-card"
      style={S.roomCard}
      onClick={onClick}
    >
      <div style={{ ...S.roomIcon, background: typeColour + "22", color: typeColour }}>
        {room.type === "single" ? <User size={18} /> : room.type === "duo" ? <Users size={18} /> : <UserPlus size={18} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.roomName}>{room.name}</div>
        <div style={S.roomMeta}>
          <span style={{ ...S.typeBadge, background: typeColour + "18", color: typeColour }}>
            {TYPE_LABEL[room.type] || room.type}
          </span>
          <span style={{ color: "#9a958c", fontSize: 12 }}>{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
        </div>
      </div>
      {isOwner && onDelete && (
        <button
          style={S.iconBtn}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete room"
        >
          <Trash2 size={15} />
        </button>
      )}
      {!isOwner && onLeave && (
        <button
          style={{ ...S.iconBtn, color: "#c97b4a" }}
          onClick={(e) => { e.stopPropagation(); onLeave(); }}
          title="Leave room"
        >
          <DoorOpen size={15} />
        </button>
      )}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <h2 style={S.h2}>Are you sure?</h2>
          <X size={18} style={{ cursor: "pointer", color: "#8a857c" }} onClick={onCancel} />
        </div>
        <p style={{ color: "#5a554c", fontSize: 14.5, lineHeight: 1.5, margin: "0 0 20px" }}>{message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="lb-btn" style={{ ...S.saveBtn, background: "#b5505a", flex: 1 }} onClick={onConfirm}>Delete</button>
          <button className="lb-btn" style={{ ...S.cancelBtn, flex: 1 }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  shell: { maxWidth: 480, margin: "0 auto", padding: "20px 16px 60px", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#2c2a26" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5b8c6e", fontWeight: 700 },
  h1: { fontSize: 26, margin: "2px 0 0", fontWeight: 700, letterSpacing: "-0.02em" },
  limitsBar: { display: "flex", gap: 8, marginBottom: 20 },
  limitChip: { fontSize: 12, fontWeight: 600, color: "#7a756c", background: "#f0ece3", border: "1px solid #ece7dd", borderRadius: 8, padding: "4px 10px" },
  sectLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "#a39e94", fontWeight: 700, marginBottom: 8 },
  roomCard: { display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid #ece7dd", borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" },
  roomIcon: { width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  roomName: { fontWeight: 700, fontSize: 15.5, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  roomMeta: { display: "flex", alignItems: "center", gap: 8 },
  typeBadge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", letterSpacing: 0.3 },
  iconBtn: { padding: 6, borderRadius: 8, border: "none", background: "transparent", color: "#c4bfb4", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 },
  empty: { textAlign: "center", color: "#a39e94", padding: "40px 0 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontSize: 14 },
  fab: { width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "#c97b4a", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 },
  ghostBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", color: "#5a554c", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(40,35,25,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  modal: { background: "#faf8f3", width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 22, maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  h2: { fontSize: 19, fontWeight: 700, margin: 0 },
  saveBtn: { padding: "13px", borderRadius: 12, border: "none", background: "#5b8c6e", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { padding: "13px", borderRadius: 12, border: "1px solid #ddd6c9", background: "#fff", color: "#5a554c", fontSize: 15, fontWeight: 700, cursor: "pointer" },
};
