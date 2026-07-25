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
  /** 기존 관리자 비밀번호로 통과한 경우. 1단계 마무리 시 제거 대상. */
  legacy: boolean;
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
    legacy: false,
  };
}

/** 기존 x-admin-password 헤더. 1단계 마무리 시 이 함수와 호출부를 함께 제거한다. */
function legacyAdmin(req: Request): AuthUser | null {
  const expected = process.env.ADMIN_PASSWORD;
  const provided = req.headers["x-admin-password"] as string | undefined;
  if (!expected || provided !== expected) return null;
  return { id: "legacy-admin", name: "관리자", role: "admin", legacy: true };
}

/**
 * 요청에서 사용자를 알아낸다. Authorization: Bearer 토큰을 먼저 보고,
 * 없으면 기존 관리자 비밀번호를 본다. 둘 다 아니면 null.
 */
export async function resolveUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const user = await userFromToken(header.slice(7).trim());
    if (user) return user;
  }
  return legacyAdmin(req);
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

/** 로그인된 교사 또는 관리자만 통과 */
export function requireTeacher() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ message: "로그인이 필요합니다." });
    }
    (req as AuthedRequest).authUser = user;
    next();
  };
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
