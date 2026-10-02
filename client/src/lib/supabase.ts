import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 브라우저용 Supabase 클라이언트.
// VITE_ 접두사가 붙은 값만 클라이언트 번들에 포함된다.
// 여기 쓰는 것은 anon(publishable) 키이며, 브라우저 노출을 전제로 설계된 키다.
// service_role 키를 이 파일에서 쓰면 절대 안 된다.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 환경변수가 없으면 null 이다.
 *
 * **그러면 아무도 로그인할 수 없다.** 예전에는 관리자 비밀번호가 안전망이었지만
 * 2026-07-28 에 그 방식을 제거했다. 그래서 로그인 모달이 조용히 실패하지 않고
 * 안내를 띄운다 (`Navigation.tsx` 의 `teacherLoginAvailable` 분기).
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isTeacherLoginAvailable = supabase !== null;
