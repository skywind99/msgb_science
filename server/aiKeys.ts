import { eq } from "drizzle-orm";
import { db } from "./db.js";
import {
  aiSettings,
  AI_SETTINGS_ID,
  type AiKeyState,
  type AiProvider,
} from "../shared/schema.js";
import { decryptKey, encryptKey } from "./aiCrypto.js";

/**
 * AI 공급자 키 보관.
 *
 * 키의 주인은 사람이 아니라 사이트다. 교사별 키는 없다.
 * 평문은 어디에도 저장하지 않는다 — 공급자별로 AES-256-GCM 으로 암호화해
 * DB 에 넣고, 복호화 비밀값은 DB 가 아니라 환경변수 `AI_KEY_SECRET` 에 둔다.
 * 그래서 **DB 덤프만으로는 키를 얻을 수 없다.**
 * (Supabase Vault 는 DB 안에서 복호화되므로 이 성질을 잃는다. 그래서 쓰지 않았다.)
 *
 * 암호화 자체는 `server/aiCrypto.ts` 에 있다.
 * 이 파일도 키 값을 로그에 남기지 않는다.
 */

// ── DB 읽기·쓰기 ──────────────────────────────────────────

/** 공급자 하나의 상태. 키 값은 들어 있지 않다. */
export type ProviderStatus = {
  state: AiKeyState;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type AiKeyStatus = Record<AiProvider, ProviderStatus>;

const NONE: ProviderStatus = { state: "none", updatedBy: null, updatedAt: null };

/** 공급자별 컬럼 이름. 한 행에 두 공급자가 들어 있어서 매번 고른다. */
function fieldsOf(provider: AiProvider) {
  return provider === "groq"
    ? { enc: "groqKeyEnc", by: "groqUpdatedBy", at: "groqUpdatedAt" } as const
    : { enc: "geminiKeyEnc", by: "geminiUpdatedBy", at: "geminiUpdatedAt" } as const;
}

type Row = typeof aiSettings.$inferSelect;

/**
 * 설정 행을 읽는다. 없으면 `null`.
 *
 * **DB 오류를 던지지 않는다.** 테이블이 아직 없거나 권한 문제가 있어도
 * 글쓰기 화면이 통째로 막히면 안 된다. 그때는 "미등록" 과 같게 보인다.
 */
async function readRow(): Promise<Row | null> {
  try {
    const rows = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.id, AI_SETTINGS_ID))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    // 사유만 남긴다. 행 내용(암호문)은 찍지 않는다.
    console.error(
      "[aiKeys] 설정을 읽을 수 없습니다:",
      err instanceof Error ? err.message : "알 수 없는 오류"
    );
    return null;
  }
}

function statusFor(row: Row | null, provider: AiProvider): ProviderStatus {
  if (!row) return NONE;
  const f = fieldsOf(provider);
  const enc = row[f.enc] as string | null;
  if (!enc) return NONE;

  const at = row[f.at] as Date | null;
  return {
    // 복호화를 해 봐야 "읽을 수 있는지" 를 알 수 있다. 결과는 버린다.
    state: decryptKey(provider, enc) === null ? "unreadable" : "ok",
    updatedBy: (row[f.by] as string | null) ?? null,
    updatedAt: at ? at.toISOString() : null,
  };
}

/** 공급자별 상태. 키 값은 절대 포함하지 않는다. */
export async function loadKeyStatus(): Promise<AiKeyStatus> {
  const row = await readRow();
  return { groq: statusFor(row, "groq"), gemini: statusFor(row, "gemini") };
}

/** 실제 키를 꺼낸다. 호출하는 쪽이 상태별로 분기한다. */
export async function loadKey(
  provider: AiProvider
): Promise<{ state: AiKeyState; key: string | null }> {
  const row = await readRow();
  if (!row) return { state: "none", key: null };

  const enc = row[fieldsOf(provider).enc] as string | null;
  if (!enc) return { state: "none", key: null };

  const key = decryptKey(provider, enc);
  return key === null ? { state: "unreadable", key: null } : { state: "ok", key };
}

/** 저장할 값 묶음. 지울 때는 `enc` 가 null 이고, 누가 언제 지웠는지는 남긴다. */
function patchFor(provider: AiProvider, enc: string | null, by: string) {
  const now = new Date();
  return provider === "groq"
    ? { groqKeyEnc: enc, groqUpdatedBy: by, groqUpdatedAt: now }
    : { geminiKeyEnc: enc, geminiUpdatedBy: by, geminiUpdatedAt: now };
}

/**
 * 키를 저장(또는 교체)한다. 설정 행은 하나뿐이라 항상 `id = 1` 로 upsert 한다.
 *
 * 관리자가 여러 명이어도 마지막 저장이 유효하다.
 * 비밀값이 없으면 `false` — 암호화할 수 없는데 평문을 넣는 일은 없어야 한다.
 */
export async function saveKey(
  provider: AiProvider,
  plain: string,
  updatedBy: string
): Promise<boolean> {
  const enc = encryptKey(provider, plain);
  if (enc === null) return false;

  await db
    .insert(aiSettings)
    .values({ id: AI_SETTINGS_ID, ...patchFor(provider, enc, updatedBy) })
    .onConflictDoUpdate({
      target: aiSettings.id,
      set: patchFor(provider, enc, updatedBy),
    });
  return true;
}

/** 키를 지운다. 행 자체는 남기고 해당 공급자 칸만 비운다. */
export async function clearKey(provider: AiProvider, updatedBy: string): Promise<void> {
  await db
    .insert(aiSettings)
    .values({ id: AI_SETTINGS_ID, ...patchFor(provider, null, updatedBy) })
    .onConflictDoUpdate({
      target: aiSettings.id,
      set: patchFor(provider, null, updatedBy),
    });
}
