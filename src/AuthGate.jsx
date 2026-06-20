import React, { useState, useEffect } from "react";
import { auth } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import App from "./App.jsx";
import { checkAllowed } from "./AdminPanel.jsx";

const S = {
  shell: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f2ec", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 16 },
  card: { background: "#fff", border: "1px solid #ece7dd", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, boxShadow: "0 2px 8px rgba(60,50,30,0.08)" },
  kicker: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5b8c6e", fontWeight: 700, marginBottom: 4 },
  h1: { fontSize: 24, fontWeight: 700, margin: "0 0 24px", letterSpacing: "-0.02em", color: "#2c2a26" },
  lbl: { display: "block", fontSize: 12.5, fontWeight: 600, color: "#7a756c", margin: "14px 0 5px" },
  input: { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid #ddd6c9", background: "#fff", fontSize: 15, fontFamily: "inherit", color: "#2c2a26", boxSizing: "border-box" },
  btn: { width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#5b8c6e", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 20 },
  link: { background: "none", border: "none", color: "#5b8c6e", fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 600 },
  error: { background: "#fdf0f0", border: "1px solid #f5c5c5", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#b5505a", marginTop: 14 },
  success: { background: "#f0faf4", border: "1px solid #b5d9c5", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#3a7a56", marginTop: 14 },
  footer: { display: "flex", justifyContent: "center", gap: 6, marginTop: 18, fontSize: 13, color: "#9a958c" },
};

export default function AuthGate() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); return; }
      const allowed = await checkAllowed(u);
      if (!allowed) {
        await signOut(auth);
        setUser(null);
        alert("Your account is not authorised. Please ask the admin to add your email first.");
        return;
      }
      setUser(u);
    });
  }, []);

  if (user === undefined) {
    return (
      <div style={S.shell}>
        <div style={{ color: "#9a958c", fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return <App user={user} onSignOut={() => signOut(auth)} />;
}

function LoginScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const clearMessages = () => { setError(""); setSuccess(""); };

  const submit = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === "register") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await sendPasswordResetEmail(auth, email);
        setSuccess("Password reset email sent — check your inbox.");
      }
    } catch (err) {
      setError(friendlyError(err.code));
    }
    setLoading(false);
  };

  return (
    <div style={S.shell}>
      <div style={S.card}>
        <div style={S.kicker}>Shared expenses</div>
        <h1 style={S.h1}>
          {mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Reset password"}
        </h1>

        <form onSubmit={submit}>
          <label style={S.lbl}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={S.input}
            required
            autoFocus
          />
          {mode !== "reset" && (
            <>
              <label style={S.lbl}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "At least 6 characters" : ""}
                style={S.input}
                required
                minLength={6}
              />
            </>
          )}
          {error && <div style={S.error}>{error}</div>}
          {success && <div style={S.success}>{success}</div>}
          <button style={S.btn} disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset email"}
          </button>
        </form>

        <div style={S.footer}>
          {mode === "login" && (
            <>
              <span>No account?</span>
              <button style={S.link} onClick={() => { setMode("register"); clearMessages(); }}>Create one</button>
              <span>·</span>
              <button style={S.link} onClick={() => { setMode("reset"); clearMessages(); }}>Forgot password</button>
            </>
          )}
          {mode !== "login" && (
            <button style={S.link} onClick={() => { setMode("login"); clearMessages(); }}>Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  );
}

function friendlyError(code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return "Something went wrong. Please try again.";
  }
}
