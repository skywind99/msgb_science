import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, isTeacherLoginAvailable } from "@/lib/supabase";

export type Role = "admin" | "teacher";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  legacy: boolean;
}

interface AdminContextType {
  /** 관리자 기능 노출 여부. 기존 비밀번호 로그인과 교사 로그인 모두 true 가 된다. */
  isAdmin: boolean;
  /** 기존 관리자 비밀번호. 1단계 마무리 시 제거 대상. */
  password: string;
  /** 로그인한 교사 정보. 기존 비밀번호 로그인일 때는 null. */
  user: AuthUser | null;
  /** API 호출에 그대로 펼쳐 쓰는 인증 헤더. 교사 토큰이 있으면 그것을, 없으면 기존 헤더를 보낸다. */
  authHeaders: Record<string, string>;
  /** 교사 이메일 로그인 사용 가능 여부 (VITE_SUPABASE_* 설정 시 true) */
  teacherLoginAvailable: boolean;
  login: (password: string) => Promise<boolean>;
  loginWithEmail: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  password: "",
  user: null,
  authHeaders: {},
  teacherLoginAvailable: false,
  login: async () => false,
  loginWithEmail: async () => ({ ok: false }),
  logout: () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [password, setPassword] = useState(() => localStorage.getItem("admin_pw") || "");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // Supabase 세션 복원 및 변화 추적.
  // 토큰은 자동 갱신되므로 상태로 들고 있다가 헤더를 만들 때 쓴다.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setAccessToken(data.session?.access_token ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      if (!session) setUser(null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 토큰이 생기면 서버에서 역할을 확인한다.
  // profiles 행이 없는 계정은 서버가 401 을 주므로 여기서 걸러진다.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    fetch("/api/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (accessToken && user) headers.Authorization = `Bearer ${accessToken}`;
    else if (password) headers["x-admin-password"] = password;
    return headers;
  }, [accessToken, user, password]);

  const login = async (pwd: string): Promise<boolean> => {
    const res = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pwd },
    });
    if (res.ok) {
      setPassword(pwd);
      localStorage.setItem("admin_pw", pwd);
      return true;
    }
    return false;
  };

  const loginWithEmail = async (
    email: string,
    pwd: string
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!supabase) {
      return { ok: false, message: "교사 로그인이 설정되지 않았습니다." };
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    if (error || !data.session) {
      return { ok: false, message: "이메일 또는 비밀번호가 올바르지 않습니다." };
    }

    // 서버에서 profiles 를 확인한다. 초대받지 않은 계정은 여기서 막힌다.
    const me = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
    if (!me.ok) {
      await supabase.auth.signOut();
      return { ok: false, message: "등록되지 않은 계정입니다. 관리자에게 문의하세요." };
    }

    setAccessToken(data.session.access_token);
    setUser(await me.json());
    return { ok: true };
  };

  const logout = () => {
    setPassword("");
    localStorage.removeItem("admin_pw");
    setUser(null);
    setAccessToken(null);
    void supabase?.auth.signOut();
  };

  const isAdmin = !!user || !!password;

  return (
    <AdminContext.Provider
      value={{
        isAdmin,
        password,
        user,
        authHeaders,
        teacherLoginAvailable: isTeacherLoginAvailable,
        login,
        loginWithEmail,
        logout,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
export const useAdminPassword = () => useContext(AdminContext).password;
/** API 호출용 인증 헤더 */
export const useAuthHeaders = () => useContext(AdminContext).authHeaders;
