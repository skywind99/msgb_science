import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Vercel 서버리스에서는 인스턴스가 여럿 뜬다. 인스턴스마다 10개를 쥐면
 * 금방 DB 연결 한도에 닿는다. **운영과 Preview 가 같은 DB 를 쓰기 때문에**
 * 한쪽이 연결을 다 쓰면 다른 쪽도 같이 막힌다.
 *
 * 로컬과 스크립트는 인스턴스가 하나뿐이라 기존 값을 그대로 둔다.
 */
const onVercel = !!process.env.VERCEL;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: onVercel ? 3 : 10,
  // 쓰지 않는 연결을 오래 쥐고 있지 않는다. 서버리스는 더 짧게.
  idleTimeoutMillis: onVercel ? 10_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * **이 핸들러가 없으면 프로세스가 죽는다.**
 *
 * `node-postgres` 는 유휴 연결에서 오류가 났을 때 `error` 리스너가 없으면
 * uncaught exception 으로 올린다. 서버리스에서는 그 인스턴스가 처리하던 요청이
 * 모두 실패한다. 풀러가 유휴 연결을 끊는 일은 정상적으로 일어나므로 반드시 받는다.
 */
pool.on("error", (err) => {
  console.error("[db] 유휴 연결 오류:", err.message);
});

export const db = drizzle(pool, { schema });