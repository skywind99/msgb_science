import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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
