import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { createSupabaseClient } from "./imageUpload.js";
import { db } from "./db.js";
import { profiles } from "../shared/schema.js";

declare const process: { env: Record<string, string | undefined> };

export type Role = "admin" | "teacher";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  authUser?: AuthUser;
}

/**
 * Supabase Auth 액세스 토큰을 검증하고 profiles 정보를 붙여 반환한다.
 *
 * 토큰 검증을 Supabase Auth 서버에 위임한다. JWT 시크릿을 직접 다루지 않으므로
 * 키 형식이 바뀌거나 회전돼도 코드를 고칠 필요가 없다.
 * 관리자 전용 경로에서만 쓰이므로 왕복 비용은 감수한다.
 */
async function userFromToken(token: string): Promise<AuthUser | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;

  let data;
  try {
    const supabase = createSupabaseClient(url, key);
    const res = await supabase.auth.getUser(token);
    if (res.error || !res.data.user) return null;
    data = res.data;
  } catch (err) {
    console.error("[auth] 토큰 검증 실패:", err);
    return null;
  }

  // auth.users 에 있어도 profiles 행이 없으면 거부한다.
  // 초대를 통해 만들어진 계정만 통과시키기 위한 장치다.
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, data.user.id))
    .limit(1);

  const profile = rows[0];
  if (!profile) return null;

  return {
    id: profile.id,
    name: profile.name,
    role: profile.role === "admin" ? "admin" : "teacher",
  };
}

/**
 * 요청에서 사용자를 알아낸다. Supabase Auth 토큰만 받는다.
 *
 * 2026-07-28 에 `x-admin-password` 헤더 인증을 제거했다. 그 방식은
 * 평문 비밀번호를 localStorage 에 두고 매 요청에 실어 보냈고, 만료가 없었고,
 * 모두가 같은 값을 써서 누가 무엇을 했는지 알 수 없었다. 게시물 `authorId` 가
 * 비어서 담당 교사가 자기 활동 명단을 볼 수 없는 문제도 여기서 왔다.
 *
 * 되돌리지 말 것. 계정이 필요하면 초대 링크로 발급한다.
 */
export async function resolveUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return await userFromToken(header.slice(7).trim());
}

/**
 * 라우트 핸들러 안에서 쓰는 인라인 가드.
 * 통과하면 사용자를 반환하고, 아니면 401 을 보내고 null 을 반환한다.
 *
 *   const user = await ensureAuth(req, res);
 *   if (!user) return;
 */
export async function ensureAuth(
  req: Request,
  res: Response
): Promise<AuthUser | null> {
  const user = await resolveUser(req);
  if (!user) {
    res.status(401).json({ message: "로그인이 필요합니다." });
    return null;
  }
  (req as AuthedRequest).authUser = user;
  return user;
}

/** admin 역할만 통과 */
export function requireAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    }
    (req as AuthedRequest).authUser = user;
    next();
  };
}
