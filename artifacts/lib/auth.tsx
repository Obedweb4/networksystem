import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface CustomerInfo {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  accountNumber: string | null;
  tenantId: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  customer: CustomerInfo | null;
}

interface AuthContextValue extends AuthState {
  login: (
    accessToken: string,
    refreshToken: string,
    customer: CustomerInfo
  ) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AUTH_KEY = "pulsenet_portal_auth";

function loadFromStorage(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return { accessToken: null, refreshToken: null, customer: null };
    return JSON.parse(raw) as AuthState;
  } catch {
    return { accessToken: null, refreshToken: null, customer: null };
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadFromStorage);

  // Wire the token getter into the shared API client on every token change
  useEffect(() => {
    setAuthTokenGetter(() => state.accessToken);
  }, [state.accessToken]);

  const login = useCallback(
    (accessToken: string, refreshToken: string, customer: CustomerInfo) => {
      const next: AuthState = { accessToken, refreshToken, customer };
      localStorage.setItem(AUTH_KEY, JSON.stringify(next));
      setState(next);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    setState({ accessToken: null, refreshToken: null, customer: null });
    setAuthTokenGetter(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        isAuthenticated: Boolean(state.accessToken && state.customer),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
