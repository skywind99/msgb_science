import "dotenv/config";
import pg from "pg";

/**
 * 오래된 신청 기록 삭제.
 *
 * 학생 신청 폼과 교사 명단 화면에 "활동 종료 후 30일 이내 삭제" 라고 고지한다.
 * 이 스크립트가 그 약속을 지키는 코드다. 문구를 바꾸면 여기 `RETENTION_DAYS` 도
 * 같이 바꿔야 한다.
 *
 * `.github/workflows/supabase-keep-alive.yml` 이 3일마다 실행한다.
 * 수동 실행:  npx tsx script/cleanup.ts            (실제 삭제)
 *             npx tsx script/cleanup.ts --dry-run  (지울 대상만 확인)
 *
 * 드리즐 대신 pg 로 직접 SQL 을 쓴다. 삭제 조건을 한눈에 검토할 수 있어야 하고,
 * CI 에서 도는 스크립트라 움직이는 부품을 줄이는 편이 낫다.
 */

const RETENTION_DAYS = 30;
const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 이 없다. .env 또는 CI 시크릿을 확인할 것.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/**
 * 활동이 끝난 시각은 종료 일시가 있으면 그것, 없으면 시작 일시로 본다
 * (`shared/activity.ts` 의 `activityEndsAt` 과 같은 규칙).
 *
 * timestamp 열에 UTC 를 담고 있으므로 `timezone('utc', now())` 과 비교한다.
 * 그냥 `now()` 를 쓰면 세션 시간대만큼 어긋난다.
 */
const AGED_OUT = `
  coalesce(p.event_end, p.event_start) is not null
  and coalesce(p.event_end, p.event_start)
      < timezone('utc', now()) - interval '${RETENTION_DAYS} days'
`;

async function main() {
  const label = dryRun ? "[미리보기]" : "[삭제]";

  // 지울 대상을 활동별로 먼저 보여준다. 개별 학생 정보는 찍지 않는다 —
  // CI 로그는 남고 아무나 볼 수 있다.
  const targets = await pool.query(`
    select p.id, p.title,
           coalesce(p.event_end, p.event_start) as ended_at,
           count(a.id)::int as n
    from applications a
    join posts p on p.id = a.post_id
    where ${AGED_OUT}
    group by p.id, p.title, ended_at
    order by ended_at
  `);

  if (targets.rowCount === 0) {
    console.log(`${label} 지울 신청 기록이 없다. (보유 기간 ${RETENTION_DAYS}일)`);
  } else {
    console.log(`${label} 보유 기간 ${RETENTION_DAYS}일이 지난 활동 ${targets.rowCount}건:`);
    for (const r of targets.rows) {
      const ended = new Date(r.ended_at).toISOString().slice(0, 10);
      console.log(`  - [${r.id}] ${r.title} (종료 ${ended}) 신청 ${r.n}건`);
    }
  }

  if (!dryRun && targets.rowCount > 0) {
    const deleted = await pool.query(`
      delete from applications a
      using posts p
      where p.id = a.post_id and ${AGED_OUT}
    `);
    console.log(`신청 기록 ${deleted.rowCount}건 삭제`);
  }

  /**
   * 활동 일시가 아예 없는 게시물의 신청은 "종료 후 30일" 을 계산할 수 없다.
   * 신청을 받는 글은 활동 시작이 필수라 정상적으로는 생기지 않는다.
   * 생겼다면 스키마 검증을 우회한 경로가 있다는 뜻이므로 눈에 띄게 남긴다.
   */
  const orphans = await pool.query(`
    select count(*)::int as n
    from applications a
    join posts p on p.id = a.post_id
    where coalesce(p.event_end, p.event_start) is null
  `);
  if (orphans.rows[0].n > 0) {
    console.warn(
      `경고: 활동 일시가 없어 보유 기간을 계산할 수 없는 신청 ${orphans.rows[0].n}건. 수동 확인 필요.`
    );
  }

  // 요청 제한 카운터도 같이 정리한다. 지금은 요청 처리 중 2% 확률로만 지워지는데,
  // 여기서 확실히 치우면 그 우연에 기대지 않아도 된다.
  if (!dryRun) {
    const rl = await pool.query(
      `delete from rate_limits where window_start < timezone('utc', now()) - interval '1 day'`
    );
    if (rl.rowCount) console.log(`요청 제한 카운터 ${rl.rowCount}건 정리`);
  }

  const left = await pool.query(`select count(*)::int as n from applications`);
  console.log(`남은 신청 기록: ${left.rows[0].n}건`);
}

main()
  .catch((err) => {
    console.error("정리 중 오류:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
