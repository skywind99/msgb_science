import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  applications,
  posts,
  type Application,
  type ApplicationSummary,
  type Post,
} from "../shared/schema.js";
import { activityStage, applyClosesAt } from "../shared/activity.js";
import { generateApplyCode, hashApplyCode, verifyApplyCode } from "./applyPassword.js";

/**
 * 활동 신청 처리.
 *
 * 개인정보 원칙상 이 모듈 밖으로 개별 신청자가 나가는 경로는 두 개뿐이다.
 * - 신청 직후 본인에게 돌려주는 응답
 * - 학년·반·번호 + 확인코드가 맞은 조회
 * 그 외 공개 API 는 `summaryFor` / `summariesForAll` 의 집계만 쓴다.
 */

/**
 * 자문 락 네임스페이스. 같은 활동에 대한 신청·취소를 한 줄로 세우는 데 쓴다.
 * 다른 기능이 우연히 같은 번호를 쓰지 않도록 임의의 상수를 잡았다.
 */
const LOCK_NS = 741_852;

type ApplicantInput = {
  grade: number;
  classNo: number;
  studentNo: number;
  name: string;
  memo?: string | null;
};

export type ApplyResult =
  | { ok: true; application: Application; code: string; waitlistPosition: number | null }
  | { ok: false; status: number; message: string };

/** 상태별 건수. 취소는 행을 지우므로 applied / waitlisted 둘만 있다. */
type Counts = { applied: number; waitlisted: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function countByStatus(tx: Tx | typeof db, postId: number): Promise<Counts> {
  const rows = await tx
    .select({ status: applications.status, n: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.postId, postId))
    .groupBy(applications.status);

  const counts: Counts = { applied: 0, waitlisted: 0 };
  for (const r of rows) {
    if (r.status === "waitlisted") counts.waitlisted = Number(r.n);
    else counts.applied = Number(r.n);
  }
  return counts;
}

/** 대기 순번. 나보다 먼저 등록된 대기자 수 + 1. 신청 확정이면 null. */
async function waitlistPosition(
  tx: Tx | typeof db,
  app: Application
): Promise<number | null> {
  if (app.status !== "waitlisted") return null;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        eq(applications.postId, app.postId),
        eq(applications.status, "waitlisted"),
        lt(applications.id, app.id)
      )
    );
  return Number(row?.n ?? 0) + 1;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/**
 * 신청 접수.
 *
 * 정원 계산과 삽입 사이에 다른 요청이 끼어들면 정원을 넘겨 받을 수 있다.
 * 트랜잭션만으로는 막히지 않는다 — 아직 없는 행은 잠글 수 없기 때문이다.
 * 그래서 활동 단위 자문 락으로 같은 활동의 신청을 직렬화한다.
 */
export async function applyToPost(post: Post, input: ApplicantInput): Promise<ApplyResult> {
  const code = generateApplyCode();
  const codeHash = hashApplyCode(code);

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_NS}, ${post.id})`);

      // 유니크 제약이 있지만 먼저 확인한다. 제약 위반으로 실패하면 트랜잭션이
      // 중단 상태가 되어 뒤 처리가 지저분해진다. 락 안이므로 이 검사는 안전하다.
      const [existing] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.postId, post.id),
            eq(applications.grade, input.grade),
            eq(applications.classNo, input.classNo),
            eq(applications.studentNo, input.studentNo)
          )
        )
        .limit(1);

      if (existing) {
        return {
          ok: false as const,
          status: 409,
          message: "이미 신청한 활동입니다. 확인코드로 조회해 주세요.",
        };
      }

      const counts = await countByStatus(tx, post.id);
      let status: "applied" | "waitlisted" = "applied";
      if (post.capacity != null && counts.applied >= post.capacity) {
        if (!post.allowWaitlist) {
          return {
            ok: false as const,
            status: 409,
            message: "정원이 모두 찼습니다. 담당 선생님께 문의해 주세요.",
          };
        }
        status = "waitlisted";
      }

      const [row] = await tx
        .insert(applications)
        .values({
          postId: post.id,
          grade: input.grade,
          classNo: input.classNo,
          studentNo: input.studentNo,
          name: input.name,
          memo: input.memo ?? null,
          codeHash,
          status,
        })
        .returning();

      return {
        ok: true as const,
        application: row,
        code,
        waitlistPosition: await waitlistPosition(tx, row),
      };
    });
  } catch (err) {
    // 락 안에서 미리 확인하므로 여기까지 오지 않아야 정상이다. 안전망.
    if (isUniqueViolation(err)) {
      return { ok: false, status: 409, message: "이미 신청한 활동입니다." };
    }
    throw err;
  }
}

/**
 * 학년·반·번호로 신청을 찾고 확인코드를 대조한다.
 *
 * 코드가 틀렸는지 신청이 없는지를 구분해서 알려주지 않는다.
 * "그 번호 학생은 신청했다"는 사실 자체가 알려줄 필요 없는 정보다.
 */
export async function findByCode(
  postId: number,
  who: { grade: number; classNo: number; studentNo: number },
  code: string
): Promise<Application | null> {
  const [app] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.postId, postId),
        eq(applications.grade, who.grade),
        eq(applications.classNo, who.classNo),
        eq(applications.studentNo, who.studentNo)
      )
    )
    .limit(1);

  if (!app) return null;
  return verifyApplyCode(code, app.codeHash) ? app : null;
}

export async function positionOf(app: Application): Promise<number | null> {
  return waitlistPosition(db, app);
}

/**
 * 본인 신청 취소.
 *
 * 상태를 "cancelled" 로 남기지 않고 행을 지운다. 유니크 제약 때문에 상태만
 * 바꾸면 다시 신청할 수 없고, 취소한 학생 정보를 계속 들고 있을 이유도 없다.
 *
 * 자리가 비면 가장 먼저 대기한 학생을 신청 확정으로 올린다. 안 올리면
 * 나중에 신청한 학생이 빈 자리를 차지해 대기 순서가 뒤집힌다.
 * 승격된 학생은 확인코드로 조회하면 바뀐 상태를 볼 수 있다.
 */
export async function cancelApplication(
  post: Post,
  app: Application
): Promise<{ promoted: boolean }> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_NS}, ${post.id})`);
    await tx.delete(applications).where(eq(applications.id, app.id));

    if (post.capacity == null) return { promoted: false };

    const counts = await countByStatus(tx, post.id);
    if (counts.applied >= post.capacity || counts.waitlisted === 0) {
      return { promoted: false };
    }

    const [next] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.postId, post.id), eq(applications.status, "waitlisted")))
      .orderBy(asc(applications.id))
      .limit(1);

    if (!next) return { promoted: false };

    await tx
      .update(applications)
      .set({ status: "applied" })
      .where(eq(applications.id, next.id));

    return { promoted: true };
  });
}

/**
 * 교사용 명단.
 *
 * 신청 확정을 먼저, 그 다음 대기자를 등록 순으로 보여준다.
 * 대기 순서가 곧 승격 순서이므로 순서가 눈에 보여야 한다.
 */
export async function listApplications(postId: number): Promise<Application[]> {
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.postId, postId))
    .orderBy(asc(applications.id));

  const applied = rows.filter((r) => r.status !== "waitlisted");
  const waiting = rows.filter((r) => r.status === "waitlisted");

  // 신청 확정은 학년·반·번호순이 명단으로 쓰기 편하다. 대기자는 등록 순 그대로.
  applied.sort(
    (a, b) =>
      a.grade - b.grade || a.classNo - b.classNo || a.studentNo - b.studentNo
  );
  return [...applied, ...waiting];
}

/** 신청 한 건과 그 활동을 함께 불러온다. 권한 검사에 게시물이 필요하다. */
export async function findApplicationWithPost(
  id: number
): Promise<{ app: Application; post: Post } | null> {
  const [row] = await db
    .select({ app: applications, post: posts })
    .from(applications)
    .innerJoin(posts, eq(applications.postId, posts.id))
    .where(eq(applications.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * 교사가 상태를 직접 바꾼다.
 *
 * 정원을 넘겨서 올리는 것도 막지 않는다. 명단의 최종 권한은 담당 교사에게 있고,
 * "한 명만 더 받자"는 판단은 화면이 아니라 교사가 한다. 대신 집계를 함께 돌려줘서
 * 정원을 넘겼다는 사실이 바로 보이게 한다.
 */
export async function updateApplicationStatus(
  app: Application,
  status: "applied" | "waitlisted"
): Promise<Application> {
  const [row] = await db
    .update(applications)
    .set({ status })
    .where(eq(applications.id, app.id))
    .returning();
  return row;
}

/**
 * 교사가 신청을 지운다.
 *
 * 학생 본인 취소(`cancelApplication`)와 달리 대기자를 자동 승격시키지 않는다.
 * 교사는 승격 버튼을 직접 갖고 있으므로, 지웠더니 다른 학생이 저절로 올라오는
 * 동작은 오히려 명단 관리를 방해한다.
 */
export async function removeApplication(id: number): Promise<boolean> {
  const rows = await db.delete(applications).where(eq(applications.id, id)).returning();
  return rows.length > 0;
}

function buildSummary(post: Post, counts: Counts, now: Date): ApplicationSummary {
  const closes = applyClosesAt(post);
  return {
    postId: post.id,
    capacity: post.capacity,
    applied: counts.applied,
    waitlisted: counts.waitlisted,
    remaining:
      post.capacity == null ? null : Math.max(0, post.capacity - counts.applied),
    isOpen: activityStage(post, now) === "open",
    closesAt: closes ? closes.toISOString() : null,
  };
}

/** 게시물 하나의 신청 집계. 개별 신청자는 절대 포함하지 않는다. */
export async function summaryFor(post: Post, now = new Date()): Promise<ApplicationSummary> {
  return buildSummary(post, await countByStatus(db, post.id), now);
}

/**
 * 신청을 받는 모든 활동의 집계.
 *
 * 홈·일정 화면이 여러 활동의 남은 자리를 한 번에 보여줘야 한다.
 * 활동마다 요청을 보내면 콜드 스타트가 그만큼 늘어나므로 한 번에 내려보낸다.
 */
export async function summariesForAll(now = new Date()): Promise<ApplicationSummary[]> {
  const activityPosts = await db.select().from(posts).where(eq(posts.applyEnabled, true));
  if (activityPosts.length === 0) return [];

  const rows = await db
    .select({
      postId: applications.postId,
      status: applications.status,
      n: sql<number>`count(*)::int`,
    })
    .from(applications)
    .groupBy(applications.postId, applications.status);

  const byPost = new Map<number, Counts>();
  for (const r of rows) {
    const c = byPost.get(r.postId) ?? { applied: 0, waitlisted: 0 };
    if (r.status === "waitlisted") c.waitlisted = Number(r.n);
    else c.applied = Number(r.n);
    byPost.set(r.postId, c);
  }

  return activityPosts.map((post) =>
    buildSummary(post, byPost.get(post.id) ?? { applied: 0, waitlisted: 0 }, now)
  );
}
