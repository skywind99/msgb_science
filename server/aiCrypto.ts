import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AiProvider } from "../shared/schema.js";

/**
 * AI 공급자 키 암·복호화.
 *
 * DB 를 건드리지 않는 순수 함수만 둔다. 보관(`server/aiKeys.ts`)과 나눈 이유는
 * 두 가지다 — 암호화를 DB 없이 검증할 수 있고, `db.ts` 가 모듈 로드 시점에
 * `DATABASE_URL` 을 요구하는 것과 얽히지 않는다.
 *
 * **이 모듈은 어떤 경우에도 키 값이나 복호화 결과를 로그에 남기지 않는다.**
 * 예외 객체조차 찍지 않는다 — 암호 라이브러리의 오류 메시지에 입력 조각이
 * 섞여 나올 수 있다.
 */

const SCHEME = "v1";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256

/**
 * 비밀값을 **호출 시점에** 읽는다.
 *
 * 모듈을 불러오는 시점에 확인하고 throw 하면, 환경변수가 없을 때 서버가 아예
 * 뜨지 않는다. AI 는 부가 기능이므로 설정이 없으면 그 기능만 꺼져야 한다
 * (`DATABASE_URL` 처럼 즉시 throw 하는 것과 다르다).
 */
function secret(): Buffer | null {
  const raw = process.env.AI_KEY_SECRET;
  if (!raw) return null;
  // base64 는 잘못된 글자를 조용히 버리므로 길이로 판정한다.
  const buf = Buffer.from(raw, "base64");
  return buf.length === KEY_LEN ? buf : null;
}

/** 비밀값이 쓸 수 있는 상태인가. 값은 돌려주지 않는다. */
export function hasUsableSecret(): boolean {
  return secret() !== null;
}

/**
 * 공급자 이름을 AAD 로 묶는다.
 * 암호문을 다른 공급자 칸으로 옮겨 붙이면 태그 검증에서 걸린다.
 */
const aad = (provider: AiProvider) => Buffer.from(provider, "utf8");

/**
 * 저장 형식: `v1.<iv>.<tag>.<ciphertext>` (각 조각 base64url)
 *
 * `v1` 접두사를 두는 이유는 나중에 알고리즘이나 키 유도를 바꿀 때
 * 기존 값을 구분해 읽기 위함이다.
 *
 * 비밀값이 없거나 길이가 틀리면 `null` 을 돌려준다. 호출하는 쪽이 안내 문구를 정한다.
 */
export function encryptKey(provider: AiProvider, plain: string): string | null {
  const key = secret();
  if (!key) return null;

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(provider));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SCHEME,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}

/**
 * 복호화. 실패하면 `null` 이다 — **던지지 않는다.**
 *
 * `null` 이 되는 경우는 모두 "키를 읽을 수 없음"으로 같게 다룬다.
 * - `AI_KEY_SECRET` 이 없거나 길이가 틀림
 * - 비밀값이 바뀌어 태그 검증 실패
 * - 다른 공급자 칸의 암호문 (AAD 불일치)
 * - 형식이 깨진 문자열
 *
 * AES-GCM 은 태그를 검증하므로 **틀린 비밀값으로도 조용히 쓰레기가 나오지 않는다.**
 * 그래서 "미등록" 과 "읽을 수 없음" 을 확실히 구분할 수 있다.
 */
export function decryptKey(provider: AiProvider, stored: string): string | null {
  const key = secret();
  if (!key) return null;

  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== SCHEME) return null;

  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ct = Buffer.from(parts[3], "base64url");
    if (iv.length !== IV_LEN || tag.length !== TAG_LEN) return null;

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(provider));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // 예외를 찍지 않는다. 메시지에 입력 조각이 섞일 수 있다.
    return null;
  }
}
