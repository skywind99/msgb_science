import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  invites,
  profiles,
  type Invite,
  type TeacherAccount,
} from "../shared/schema.js";
import { toDisplayId, toLoginEmail } from "../shared/teacherId.js";
import { createSupabaseClient } from "./imageUpload.js";

declare const process: { env: Record<string, string | undefined> };

/**
 * 교사 초대.
 *
 * 자율 가입은 열지 않는다는 설계 결정 때문에, 계정은 관리자가 발급한 초대
 * 링크로만 만들어진다. Supabase 대시보드의 "Allow new users to sign up" 은
 * 꺼 두어야 하고, 그 상태에서도 계정을 만들 수 있도록 여기서는 서버의
 * service_role 키로 Admin API 를 쓴다. 브라우저에서 `auth.signUp` 을 부르면
 * 가입이 막혀 있어 실패한다.
 */

/**
 * 토큰은 sha256 해시로 저장한다. scrypt 를 쓰지 않는 이유:
 * 토큰이 256비트 난수라 사전·무차별 공격이 성립하지 않고,
 * 해시로 바로 조회해야 하기 때문이다. scrypt 면 전체 행을 훑어야 한다.
 *
 * 학생 확인 비밀번호와는 사정이 정반대다. 그쪽은 사람이 정하는 짧은 값이라
 * 반드시 scrypt 를 써야 한다 (`server/applyPassword.ts`).
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvite(input: {
  role: "teacher" | "admin";
  memo?: string;
  expiresInDays: number;
}): Promise<{ invite: Invite; token: string }> {
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(invites)
    .values({
      tokenHash: hashInviteToken(token),
      role: input.role,
      memo: input.memo ?? null,
      expiresAt,
    })
    .returning();

  return { invite, token };
}

export async function listInvites(): Promise<Invite[]> {
  return await db.select().from(invites).orderBy(desc(invites.createdAt));
}

export async function deleteInvite(id: number): Promise<boolean> {
  const rows = await db.delete(invites).where(eq(invites.id, id)).returning();
  return rows.length > 0;
}

export type InviteLookup =
  | { ok: true; invite: Invite }
  | { ok: false; reason: "notfound" | "used" | "expired" };

/** 토큰으로 초대를 찾고 쓸 수 있는 상태인지 본다. */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, hashInviteToken(token)))
    .limit(1);

  if (!invite) return { ok: false, reason: "notfound" };
  if (invite.usedBy || invite.usedAt) return { ok: false, reason: "used" };
  if (invite.expiresAt < new Date()) return { ok: false, reason: "expired" };
  return { ok: true, invite };
}

export type AcceptResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string };

/**
 * 초대를 사용해 계정을 만든다.
 *
 * 순서가 중요하다. `invites.used_by` 가 `profiles.id` 를 참조하므로 초대를
 * 먼저 소모할 수 없다. 그래서 계정 → profiles → 초대 소모 순으로 진행하고,
 * 마지막 단계에서 `used_by is null` 조건이 걸린 UPDATE 로 원자적으로 가져간다.
 * 같은 링크를 두 사람이 동시에 열어도 한 명만 통과한다.
 *
 * 중간에 실패하면 앞 단계를 되돌린다. 안 되돌리면 로그인은 되는데 profiles 가
 * 없어 서버가 거부하는 계정, 혹은 쓸 수 없는 유령 계정이 남는다.
 */
export async function acceptInvite(
  invite: Invite,
  input: { loginId: string; password: string; name: string }
): Promise<AcceptResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("[invites] SUPABASE 환경변수가 없어 계정을 만들 수 없다");
    return { ok: false, status: 500, message: "서버 설정이 완료되지 않았습니다." };
  }

  const supabase = createSupabaseClient(url, key);

  // 1) Auth 계정. 아이디에 받을 수 없는 도메인을 붙여 내부 이메일로 쓴다
  //    (`shared/teacherId.ts`). 메일 확인 절차는 건너뛴다 — 애초에 받을 수 없는
  //    주소이고, 관리자가 링크를 직접 전달했다는 것이 이미 확인 절차다.
  const created = await supabase.auth.admin.createUser({
    email: toLoginEmail(input.loginId),
    password: input.password,
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    const raw = created.error?.message ?? "";
    console.error("[invites] 계정 생성 실패:", raw);
    // 이미 쓰는 아이디인지 구분해 준다. 그 외 사유는 그대로 노출하지 않는다.
    const dup = /already|exists|registered/i.test(raw);
    return {
      ok: false,
      status: dup ? 409 : 500,
      message: dup
        ? "이미 쓰고 있는 아이디입니다. 다른 아이디를 입력해 주세요."
        : "계정을 만들지 못했습니다. 관리자에게 문의해 주세요.",
    };
  }

  const userId = created.data.user.id;

  const rollbackUser = async () => {
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (err) {
      console.error("[invites] 계정 되돌리기 실패:", userId, err);
    }
  };

  // 2) profiles 행. 이 행이 없으면 서버가 로그인을 거부한다.
  try {
    await db.insert(profiles).values({
      id: userId,
      name: input.name,
      role: invite.role === "admin" ? "admin" : "teacher",
    });
  } catch (err) {
    console.error("[invites] profiles 삽입 실패:", err);
    await rollbackUser();
    return { ok: false, status: 500, message: "계정을 만들지 못했습니다." };
  }

  // 3) 초대 소모. 동시에 두 명이 통과하지 못하도록 조건부 UPDATE 로 가져간다.
  const claimed = await db
    .update(invites)
    .set({ usedBy: userId, usedAt: new Date() })
    .where(and(eq(invites.id, invite.id), isNull(invites.usedBy)))
    .returning({ id: invites.id });

  if (claimed.length === 0) {
    await db.delete(profiles).where(eq(profiles.id, userId));
    await rollbackUser();
    return {
      ok: false,
      status: 409,
      message: "이미 사용된 초대 링크입니다. 관리자에게 새 링크를 요청해 주세요.",
    };
  }

  return { ok: true, userId };
}

/**
 * 교사 계정 목록.
 *
 * 로그인 아이디는 `auth.users.email` 에 있다. 드리즐 스키마는 `public` 만 다루므로
 * 여기서는 raw SQL 로 조인한다. `profiles` 에 아이디를 복사해 두면 두 곳이
 * 어긋날 수 있어 원본을 그대로 읽는다.
 */
export async function listTeachers(): Promise<TeacherAccount[]> {
  const result = await db.execute(sql`
    select p.id, p.name, p.role, p.created_at, u.email
    from profiles p
    join auth.users u on u.id = p.id
    order by p.created_at nulls last, p.name
  `);

  const rows =
    (result as unknown as {
      rows?: Array<{
        id: string;
        name: string;
        role: string;
        created_at: Date | string | null;
        email: string;
      }>;
    }).rows ?? [];

  return rows.map((r) => ({
    id: r.id,
    loginId: toDisplayId(r.email),
    name: r.name,
    role: r.role === "admin" ? "admin" : "teacher",
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));
}

/**
 * 읽기 쉬운 임시 비밀번호.
 *
 * 관리자가 교사에게 구두나 메모로 전달하므로 헷갈리는 글자를 뺀다 —
 * 0/O, 1/l/I 를 섞어 놓으면 "영이야 오야" 문의가 그대로 발생한다.
 */
function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[randomInt(0, alphabet.length)];
  }
  return out;
}

export type ResetResult =
  | { ok: true; loginId: string; tempPassword: string }
  | { ok: false; status: number; message: string };

/**
 * 관리자가 교사 비밀번호를 재설정한다.
 *
 * 교사는 받을 수 없는 주소를 쓰므로 메일로 스스로 재설정할 수 없다
 * (`shared/teacherId.ts` 의 대가). 이 경로가 유일한 복구 수단이다.
 *
 * 임시 비밀번호를 서버가 만들어 한 번만 돌려준다. 관리자가 정하게 하면
 * 결국 흔한 값을 쓴다.
 */
export async function resetTeacherPassword(teacherId: string): Promise<ResetResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return { ok: false, status: 500, message: "서버 설정이 완료되지 않았습니다." };
  }

  // profiles 에 있는 계정만 건드린다. auth.users 를 직접 겨냥하지 못하게 한다.
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, teacherId))
    .limit(1);

  if (!profile) {
    return { ok: false, status: 404, message: "계정을 찾을 수 없습니다." };
  }

  const tempPassword = generateTempPassword();
  const supabase = createSupabaseClient(url, key);
  const updated = await supabase.auth.admin.updateUserById(teacherId, {
    password: tempPassword,
  });

  if (updated.error || !updated.data.user) {
    console.error("[invites] 비밀번호 재설정 실패:", updated.error?.message);
    return { ok: false, status: 500, message: "비밀번호를 바꾸지 못했습니다." };
  }

  return {
    ok: true,
    loginId: toDisplayId(updated.data.user.email ?? ""),
    tempPassword,
  };
}

