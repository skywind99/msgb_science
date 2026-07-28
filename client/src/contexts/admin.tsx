import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, isTeacherLoginAvailable } from "@/lib/supabase";
import { toLoginEmail } from "@shared/teacherId";

export type Role = "admin" | "teacher";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

interface AdminContextType {
  /** 관리자 기능 노출 여부. 로그인한 교사·관리자면 true. */
  isAdmin: boolean;
  /** 로그인한 사용자. 비로그인이면 null. */
  user: AuthUser | null;
  /** API 호출에 그대로 펼쳐 쓰는 인증 헤더 */
  authHeaders: Record<string, string>;
  /** 로그인 사용 가능 여부 (VITE_SUPABASE_* 설정 시 true) */
  teacherLoginAvailable: boolean;
  /** 아이디(또는 기존 이메일)와 비밀번호로 로그인 */
  loginWithEmail: (loginId: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  user: null,
  authHeaders: {},
  teacherLoginAvailable: false,
  loginWithEmail: async () => ({ ok: false }),
  logout: () => {},
});

/**
 * 로그인 상태.
 *
 * 2026-07-28 에 기존 `x-admin-password` 방식을 제거했다. 평문 비밀번호를
 * localStorage 에 두고 매 요청에 실어 보내던 구조였다 — XSS 한 번에 새고,
 * 만료가 없고, 모두가 같은 값을 써서 누가 무엇을 했는지 알 수 없었다.
 * 되돌리지 말 것.
 */
export function AdminProvider({ children }: { children: React.ReactNode }) {
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
    return headers;
  }, [accessToken, user]);

  /**
   * 교사 로그인. 입력은 아이디이고 내부적으로 이메일로 바꿔 Supabase 에 넘긴다
   * (`shared/teacherId.ts`). `@` 가 들어 있으면 실제 이메일로 보고 그대로 쓴다 —
   * 아이디 방식으로 바꾸기 전에 만든 계정이 잠기지 않게 하는 예외다.
   */
  const loginWithEmail = async (
    loginId: string,
    pwd: string
  ): Promise<{ ok: boolean; message?: string }> => {
    if (!supabase) {
      return { ok: false, message: "교사 로그인이 설정되지 않았습니다." };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(loginId),
      password: pwd,
    });
    if (error || !data.session) {
      return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
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
    setUser(null);
    setAccessToken(null);
    void supabase?.auth.signOut();
    // 옛 방식이 남겨둔 평문 비밀번호를 지운다. 이 줄은 한동안 두어야 한다 —
    // 예전에 로그인한 브라우저에 값이 그대로 남아 있다.
    localStorage.removeItem("admin_pw");
  };

  const isAdmin = !!user;

  return (
    <AdminContext.Provider
      value={{
        isAdmin,
        user,
        authHeaders,
        teacherLoginAvailable: isTeacherLoginAvailable,
        loginWithEmail,
        logout,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
/** API 호출용 인증 헤더 */
export const useAuthHeaders = () => useContext(AdminContext).authHeaders;
