import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth';
import { ApiError, hasSession, setSessionExpiredHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Starts true whenever a refresh token exists, so routes can wait for the
  // silent "am I still logged in?" check instead of flashing a logged-out
  // page for a user who actually has a valid session.
  const [loading, setLoading] = useState(hasSession());

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));

    if (!hasSession()) return;

    authApi
      .fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const register = useCallback(async (input) => {
    const newUser = await authApi.register(input);
    setUser(newUser);
    return newUser;
  }, []);

  const login = useCallback(async (input) => {
    const loggedInUser = await authApi.login(input);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: Boolean(user), register, login, logout }),
    [user, loading, register, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export { ApiError };
