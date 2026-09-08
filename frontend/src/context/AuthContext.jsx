import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { me as fetchMe } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,     setUser]     = useState(null);
  const [customer, setCustomer] = useState(null);
  const [provider, setProvider] = useState(null);
  const [unread,   setUnread]   = useState(0);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    try {
      const session = await fetchMe();
      setUser(session.user);
      setCustomer(session.customer ?? null);
      setProvider(session.provider ?? null);
      setUnread(session.unread_notifications ?? 0);
    } catch {
      localStorage.removeItem("token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const signIn = useCallback((token, sessionOrUser) => {
    localStorage.setItem("token", token);
    const u = sessionOrUser?.user || (sessionOrUser?.id ? sessionOrUser : null);
    setUser(u);
    setCustomer(sessionOrUser?.customer ?? null);
    setProvider(sessionOrUser?.provider ?? null);
    setUnread(sessionOrUser?.unread_notifications ?? 0);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
    setCustomer(null);
    setProvider(null);
    setUnread(0);
  }, []);

  const decrementUnread = useCallback((n = 1) => {
    setUnread(u => Math.max(0, u - n));
  }, []);

  const clearUnread = useCallback(() => setUnread(0), []);

  return (
    <AuthContext.Provider value={{
      user, customer, provider, unread,
      loading, signIn, signOut, reload: load,
      clearUnread, decrementUnread,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
}
