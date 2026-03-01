import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "./queryClient";

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  orgRole: string;
  orgId: string;
  isVoucherUser: boolean;
}

interface AuthOrg {
  id: string;
  name: string;
  plan: string;
}

interface AuthState {
  user: AuthUser | null;
  organization: AuthOrg | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  organization: null,
  isLoading: true,
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery<{ user: AuthUser; organization: AuthOrg } | null>({
    queryKey: ["/api/auth/session"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60000,
    retry: false,
  });

  return (
    <AuthContext.Provider
      value={{
        user: data?.user || null,
        organization: data?.organization || null,
        isLoading,
        isAuthenticated: !!data?.user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
