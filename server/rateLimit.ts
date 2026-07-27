import { createHash } from "node:crypto";
import type { Request } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db.js";

/**
 * DB 기반 요청 제한.
 *
 * 왜 DB 인가: Vercel 서버리스에서는 모듈 전역 변수가 인스턴스마다 따로 존재한다.
 * 메모리 카운터를 쓰면 인스턴스가 늘어난 만큼 제한이 느슨해지고, 공격자는
 * 그냥 요청을 빨리 보내기만 하면 된다. 이 프로젝트의 뉴스 캐시가 같은 이유로
 * 무효인 상태다. 확인 비밀번호는 학생이 직접 정한 값이라 랜덤 코드보다 약하고,
 * 제한이 헐거우면 같은 반 친구가 찍어서 남의 신청을 취소할 수 있다.
 *
 * 고정 창(fixed window) 방식이다. 창 경계에서 최대 2배까지 통과할 수 있지만
 * 여기서 막으려는 것은 초당 수백 회짜리 대입이므로 충분하다.
 */

/** 카운터 키는 원문을 저장하지 않는다. 원문에 IP·학년·반·번호가 들어간다. */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/**
 * 요청자 IP. Vercel 은 `x-forwarded-for` 의 첫 항목에 실제 클라이언트를 넣는다.
 *
 * 학교 안에서는 한 반이 같은 공용 IP 로 나간다. 그래서 IP 기준 제한은
 * "정상 사용도 걸릴 수 있는" 값으로 잡으면 안 된다. 실패한 요청만 세거나
 * 넉넉한 한도를 쓴다. 아래 LIMITS 주석 참고.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = raw?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}

export type LimitResult = { ok: boolean; retryAfterSec: number };

/**
 * 카운터를 1 올리고 한도를 넘었는지 알려준다.
 *
 * DB 오류가 나면 **막는 쪽**으로 넘어간다. 요청 제한이 동작하지 않는 상태로
 * 신청·조회 API 를 열어두는 것보다 잠깐 안 되는 게 낫다.
 * (`rate_limits` 테이블이 없으면 여기서 바로 드러난다.)
 */
export async function hitLimit(
  key: string,
  limit: number,
  windowSec: number
): Promise<LimitResult> {
  try {
    // window_start 를 raw SQL 로 읽으면 드리즐의 UTC 매핑을 타지 않아
    // 시간대가 어긋난다. 남은 시간 계산까지 SQL 안에서 끝낸다.
    const result = await db.execute(sql`
      insert into rate_limits (key, count, window_start)
      values (${hashKey(key)}, 1, timezone('utc', now()))
      on conflict (key) do update set
        count = case
          when rate_limits.window_start
               < timezone('utc', now()) - make_interval(secs => ${windowSec})
          then 1
          else rate_limits.count + 1
        end,
        window_start = case
          when rate_limits.window_start
               < timezone('utc', now()) - make_interval(secs => ${windowSec})
          then timezone('utc', now())
          else rate_limits.window_start
        end
      returning
        count,
        greatest(
          1,
          ceil(${windowSec}::numeric
               - extract(epoch from (timezone('utc', now()) - window_start)))
        )::int as retry_after
    `);

    const row = (result as unknown as { rows?: Array<{ count: number; retry_after: number }> })
      .rows?.[0];
    if (!row) return { ok: false, retryAfterSec: 60 };

    return {
      ok: Number(row.count) <= limit,
      retryAfterSec: Number(row.retry_after),
    };
  } catch (err) {
    console.error("[rateLimit] 카운터 갱신 실패:", err);
    return { ok: false, retryAfterSec: 60 };
  }
}

/** 정상 처리된 뒤 실패 카운터를 지운다. 코드를 맞힌 학생이 다음에 막히지 않게. */
export async function resetLimit(key: string): Promise<void> {
  try {
    await db.execute(sql`delete from rate_limits where key = ${hashKey(key)}`);
  } catch (err) {
    // 지우지 못해도 창이 지나면 저절로 초기화된다. 요청을 실패시킬 이유는 없다.
    console.error("[rateLimit] 카운터 초기화 실패:", err);
  }
}

/**
 * 오래된 카운터 정리. 창이 지난 행은 아무 의미가 없다.
 * 크론을 새로 붙이지 않고 낮은 확률로 같이 처리한다.
 */
export async function pruneRateLimits(): Promise<void> {
  try {
    await db.execute(
      sql`delete from rate_limits where window_start < timezone('utc', now()) - interval '1 day'`
    );
  } catch (err) {
    console.error("[rateLimit] 정리 실패:", err);
  }
}

/**
 * 한도 값 모음.
 *
 * 학교는 한 반 30명이 같은 공용 IP 로 나온다는 점이 설계의 핵심 제약이다.
 * - `applyPerIp` — 신청 자체. 한 반이 수업 시간에 동시에 신청하는 상황을 통과시켜야
 *   하므로 넉넉하다. 중복 신청은 유니크 제약이 막으므로 여기서 조일 필요가 없다.
 * - `applyPasswordFail` — 활동 비밀번호 틀린 횟수. **실패만** 센다.
 * - `lookupPerStudent` — 확인 비밀번호 조회·취소 실패를 학생 단위로 센다.
 *   비밀번호는 학생이 직접 정한 값이라 랜덤 코드보다 약하므로, 추측하기 쉬운 값을
 *   거부하는 `shared/studentSecret.ts` 와 **함께** 있어야 의미가 있다.
 *   장시간 잠금은 두지 않는다 — 학교에서 하루 잠기면 학생이 교사를 찾아가게 되고
 *   그게 이 설계로 피하려던 부담이다. 최대 10분이고 맞히면 즉시 풀린다.
 * - `lookupPerIp` — 여러 학생 기록을 번갈아 찍는 수법 차단. 실패만 세므로
 *   정상적으로 조회하는 학생은 걸리지 않는다.
 */
export const LIMITS = {
  applyPerIp: { limit: 40, windowSec: 600 },
  applyPasswordFail: { limit: 10, windowSec: 600 },
  lookupPerStudent: { limit: 5, windowSec: 600 },
  lookupPerIp: { limit: 20, windowSec: 3600 },
  /**
   * 초대 링크 확인·수락. 토큰이 256비트 난수라 대입이 성립하지 않으므로
   * 강도 방어가 아니라 남용 방지용이다. 교사가 한 번 쓰는 경로라 넉넉할 필요가 없다.
   */
  invitePerIp: { limit: 20, windowSec: 600 },
} as const;
