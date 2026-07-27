import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 활동별 신청 비밀번호 해싱.
 *
 * 교사가 해당 학급에만 구두로 알려주는 용도의 공유 비밀번호다.
 * 개인 계정 비밀번호가 아니지만, 평문으로 두면 DB 를 보는 사람이
 * 그대로 신청할 수 있으므로 해시만 저장한다.
 *
 * 외부 의존성을 늘리지 않기 위해 Node 내장 scrypt 를 쓴다.
 * 저장 형식: `scrypt$<salt(hex)>$<hash(hex)>`
 */
const KEY_LEN = 32;

export function hashApplyPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain.normalize("NFKC"), salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyApplyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LEN) return false;

  const actual = scryptSync(plain.normalize("NFKC"), Buffer.from(saltHex, "hex"), KEY_LEN);
  return timingSafeEqual(actual, expected);
}

/**
 * 신청 확인코드 6자리 생성.
 *
 * 학생이 외우거나 적어둘 수 있어야 해서 6자리다. 대신 짧으므로
 * 저장은 해시로만 하고, 조회 API 에 요청 제한을 반드시 함께 건다
 * (`server/rateLimit.ts` 의 `lookupPerStudent`).
 *
 * `Math.random` 대신 `randomInt` 를 쓴다. 예측 가능한 코드는 해시로 저장해도
 * 의미가 없다. 0 으로 시작하는 코드도 유효하므로 앞을 채운다.
 */
export function generateApplyCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 확인코드도 같은 scrypt 형식으로 저장한다. */
export const hashApplyCode = hashApplyPassword;
export const verifyApplyCode = verifyApplyPassword;
