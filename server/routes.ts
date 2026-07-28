import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { api } from "../shared/routes.js";
import {
  toMyApplication,
  toPublicPost,
  toInviteSummary,
  toRosterEntry,
  type Application,
  type Post,
} from "../shared/schema.js";
import { activityStage, STAGE_REJECT_MESSAGE } from "../shared/activity.js";
import { buildCalendar, contentDisposition, postToEvent } from "./calendar.js";
import { z } from "zod";
import { mirrorImageToStorage, uploadBufferToStorage } from "./imageUpload.js";
import { ensureAuth, requireAdmin, type AuthedRequest, type AuthUser } from "./auth.js";
import {
  acceptInvite,
  createInvite,
  deleteInvite,
  listInvites,
  listTeachers,
  lookupInvite,
  resetTeacherPassword,
} from "./invites.js";
import { hashApplyPassword, verifyApplyPassword } from "./applyPassword.js";
import {
  applyToPost,
  cancelApplication,
  findApplicationWithPost,
  findByPassword,
  listApplications,
  positionOf,
  removeApplication,
  summariesForAll,
  summaryFor,
  updateApplicationStatus,
} from "./applications.js";
import {
  clientIp,
  hitLimit,
  LIMITS,
  pruneRateLimits,
  resetLimit,
  type LimitResult,
} from "./rateLimit.js";

declare const process: { env: Record<string, string | undefined> };

interface ScienceNewsItem {
  title: string;
  summary: string;
  imageUrl: string | null;
  link: string;
  date: string;
}

// 캐시 (1시간)
let scienceNewsCache: { data: ScienceNewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;

async function fetchScienceNews(): Promise<ScienceNewsItem[]> {
  const now = Date.now();
  if (scienceNewsCache && now - scienceNewsCache.fetchedAt < CACHE_TTL) {
    return scienceNewsCache.data;
  }

  const res = await fetch(
    "https://www.sciencetimes.co.kr/nscvrg/list/menu/265?sersYn=Y",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; school-site/1.0)" } }
  );
  const html = await res.text();

  const items: ScienceNewsItem[] = [];

  const positions: number[] = [];
  let pos = 0;
  while ((pos = html.indexOf('class="sub_txt"', pos)) !== -1) {
    positions.push(pos);
    pos++;
  }

  for (let i = 0; i < Math.min(positions.length, 5); i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : start + 2000;
    const block = html.slice(start, end);

    const titleMatch = block.match(/<b>([\s\S]*?)<\/b>/);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";
    if (!title) continue;

    const summaryMatch = block.match(/<span>([\s\S]*?)<\/span>/);
    let summary = "";
    if (summaryMatch) {
      const raw = summaryMatch[1].replace(/<[^>]+>/g, "").trim();
      summary = raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
    }

    const linkMatch = block.match(/href="([^"]*nscvrgSn=\d+[^"]*)"/);
    const href = linkMatch ? linkMatch[1] : "";
    const link = href
      ? href.startsWith("http") ? href : "https://www.sciencetimes.co.kr" + href
      : "https://www.sciencetimes.co.kr/nscvrg/list/menu/265?sersYn=Y";

    const imgMatch = block.match(/jnrepo\/upload\/[^"']+\.(jpg|jpeg|png|gif|webp)/i);
    let imageUrl: string | null = imgMatch
      ? "https://www.sciencetimes.co.kr/" + imgMatch[0]
      : null;

    // 이미지가 있으면 Supabase Storage에 미러링
    if (imageUrl) {
      imageUrl = await mirrorImageToStorage(imageUrl);
    }

    const before = html.slice(Math.max(0, start - 500), start);
    const dateMatches = before.match(/(\d{4}-\d{2}-\d{2})/g);
    const date = dateMatches ? dateMatches[dateMatches.length - 1] : "";

    items.push({ title, summary, imageUrl, link, date });
  }

  const data = items.length > 0 ? items : [{
    title: "사이언스타임즈 최신 기사",
    summary: "",
    imageUrl: null,
    link: "https://www.sciencetimes.co.kr/nscvrg/list/menu/265?sersYn=Y",
    date: "",
  }];

  scienceNewsCache = { data, fetchedAt: now };
  return data;
}

// ── 신청 API 공용 헬퍼 ────────────────────────────────────

function tooManyRequests(res: Response, limit: LimitResult) {
  res.setHeader("Retry-After", String(limit.retryAfterSec));
  return res.status(429).json({
    message: `요청이 너무 많습니다. ${limit.retryAfterSec}초 후에 다시 시도해 주세요.`,
    retryAfter: limit.retryAfterSec,
  });
}

function badRequest(res: Response, err: unknown) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: err.errors[0].message,
      field: err.errors[0].path.join("."),
    });
  }
  throw err;
}

/** 오래된 요청 제한 행 정리. 크론을 새로 붙이지 않고 낮은 확률로 같이 처리한다. */
function maybePrune() {
  if (Math.random() < 0.02) void pruneRateLimits();
}

/** 신청을 받는 게시물을 불러온다. 아니면 응답까지 보내고 null 을 반환한다. */
async function loadActivity(req: Request, res: Response): Promise<Post | null> {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(404).json({ message: "Invalid ID" });
    return null;
  }
  const post = await storage.getPost(id);
  if (!post) {
    res.status(404).json({ message: "게시물을 찾을 수 없습니다." });
    return null;
  }
  if (!post.applyEnabled) {
    res.status(400).json({ message: "신청을 받지 않는 게시물입니다." });
    return null;
  }
  return post;
}

/**
 * 명단을 볼 권한이 있는지 확인한다.
 *
 * `admin` 은 전체, `teacher` 는 자기가 올린 활동만이다. 학생 개인정보가 나가는
 * 경로이므로 게시물이 존재하는지보다 권한을 먼저 따진다.
 *
 * 기존 관리자 비밀번호로 만든 게시물은 `authorId` 가 null 이다.
 * 이런 글은 admin 만 볼 수 있다 — 담당자를 알 수 없는 명단을 아무 교사에게나
 * 열어주는 것보다 낫다.
 */
async function loadOwnedActivity(
  req: Request,
  res: Response
): Promise<{ post: Post; user: AuthUser } | null> {
  const user = await ensureAuth(req, res);
  if (!user) return null;

  const post = await loadActivity(req, res);
  if (!post) return null;

  if (user.role !== "admin" && post.authorId !== user.id) {
    res.status(403).json({ message: "이 활동의 명단을 볼 권한이 없습니다." });
    return null;
  }
  return { post, user };
}

/** 신청 한 건에 대한 권한 확인. 상태 변경·삭제가 같이 쓴다. */
async function loadOwnedApplication(
  req: Request,
  res: Response
): Promise<{ app: Application; post: Post; user: AuthUser } | null> {
  const user = await ensureAuth(req, res);
  if (!user) return null;

  const id = parseInt(String(req.params.id));
  if (isNaN(id)) {
    res.status(404).json({ message: "Invalid ID" });
    return null;
  }

  const found = await findApplicationWithPost(id);
  if (!found) {
    res.status(404).json({ message: "신청을 찾을 수 없습니다." });
    return null;
  }
  if (user.role !== "admin" && found.post.authorId !== user.id) {
    res.status(403).json({ message: "이 활동의 명단을 관리할 권한이 없습니다." });
    return null;
  }
  return { ...found, user };
}

/**
 * 학년·반·번호 + 확인 비밀번호로 본인을 확인한다. 조회와 취소가 같이 쓴다.
 *
 * 요청 제한이 이 함수의 핵심이다. 비밀번호는 학생이 직접 정한 값이라
 * 랜덤 코드보다 약하다. 제한이 없으면 같은 반 친구가 몇 번 찍어서 남의 신청을
 * 취소할 수 있다. 학생 단위와 IP 단위를 함께 걸고, 맞힌 뒤에는 카운터를 지워
 * 정상 사용자가 막히지 않게 한다.
 *
 * **조회와 취소가 같은 카운터를 쓰는 것이 중요하다.** 따로 걸면 느슨한 쪽에서
 * 비밀번호를 알아낸 다음 다른 쪽으로 넘어가면 되므로 제한이 무의미해진다.
 *
 * 학교는 한 반이 같은 공용 IP 로 나오므로 성공 시 초기화가 없으면
 * 정상 조회가 서로를 막는다.
 */
async function verifiedApplication(
  req: Request,
  res: Response
): Promise<{ post: Post; app: Application } | null> {
  maybePrune();

  let input;
  try {
    input = api.applications.lookup.input.parse(req.body);
  } catch (err) {
    badRequest(res, err);
    return null;
  }

  const ip = clientIp(req);
  const studentKey = `lookup:${input.postId}:${input.grade}:${input.classNo}:${input.studentNo}`;
  const ipKey = `lookup:ip:${ip}`;

  const byStudent = await hitLimit(
    studentKey,
    LIMITS.lookupPerStudent.limit,
    LIMITS.lookupPerStudent.windowSec
  );
  if (!byStudent.ok) {
    tooManyRequests(res, byStudent);
    return null;
  }

  const byIp = await hitLimit(ipKey, LIMITS.lookupPerIp.limit, LIMITS.lookupPerIp.windowSec);
  if (!byIp.ok) {
    tooManyRequests(res, byIp);
    return null;
  }

  const post = await storage.getPost(input.postId);
  const app = post ? await findByPassword(post.id, input, input.studentPassword) : null;

  // 신청이 없는 것과 비밀번호가 틀린 것을 구분해서 알려주지 않는다.
  // "그 번호 학생이 신청했다"는 사실도 알려줄 필요가 없는 정보다.
  if (!post || !app) {
    res.status(404).json({
      message: "신청 정보를 찾을 수 없습니다. 학년·반·번호와 확인 비밀번호를 확인해 주세요.",
    });
    return null;
  }

  await Promise.all([resetLimit(studentKey), resetLimit(ipKey)]);
  return { post, app };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 게시물 응답은 반드시 toPublicPost 를 거친다. applyPasswordHash 를 밖으로 내보내지 않는다.
  app.get(api.posts.list.path, async (req, res) => {
    const category = req.query.category as string | undefined;
    const postsList = await storage.getPosts(category);
    res.json(postsList.map(toPublicPost));
  });

  app.get(api.posts.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    const post = await storage.getPost(id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(toPublicPost(post));
  });

  // ── 사이언스타임즈 최신 기사 목록 ────────────────────────
  app.get("/api/science-news", async (_req, res) => {
    try {
      const news = await fetchScienceNews();
      res.json(news);
    } catch (err) {
      console.error("science-news fetch error:", err);
      res.status(500).json({ message: "기사를 불러올 수 없습니다." });
    }
  });

  // ── 이미지 업로드 ────────────────────────────────────────
  // express.raw({ type: "image/*" }) 가 app/index 레벨에서 등록되어
  // req.body 가 Buffer 로 들어옴
  app.post("/api/upload-image", async (req, res) => {
    if (!(await ensureAuth(req, res))) return;

    try {
      const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim();
      if (!contentType.startsWith("image/")) {
        return res.status(400).json({ message: "이미지 파일만 업로드 가능합니다." });
      }

      const body = req.body as Buffer;
      if (!body || body.length === 0) {
        return res.status(400).json({ message: "파일이 비어 있습니다." });
      }

      const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const filename = `post-images/${Date.now()}.${ext}`;
      const result = await uploadBufferToStorage(body, filename, contentType);
      if (!result.ok) {
        // 실제 원인은 서버 로그에만 남기고, 응답에는 정리된 문구를 보낸다
        console.error("[upload-image]", result.reason);
        return res.status(500).json({ message: result.userMessage });
      }
      return res.json({ url: result.url });
    } catch (err) {
      console.error("upload-image error:", err);
      res.status(500).json({ message: "업로드 중 오류가 발생했습니다." });
    }
  });

  // ── Storage 사용량 조회 ───────────────────────────────────
  app.get("/api/storage-usage", async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    try {
      // createSupabaseClient를 써야 한다. 직접 createClient를 부르면 Node 20에서
      // native WebSocket이 없어 예외가 난다 (imageUpload.ts 주석 참고).
      const { createSupabaseClient, BUCKET } = await import("./imageUpload.js");
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_KEY;
      if (!url || !key) return res.json({ used: 0, total: 1024 * 1024 * 1024 });

      const supabase = createSupabaseClient(url, key);
      const TOTAL = 1024 * 1024 * 1024; // Supabase 무료 1GB

      let totalSize = 0;
      const folders = ["scraped", "post-images"];
      for (const folder of folders) {
        const { data } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 });
        if (data) {
          totalSize += data.reduce((sum: number, f: any) => sum + (f.metadata?.size ?? 0), 0);
        }
      }

      res.json({ used: totalSize, total: TOTAL });
    } catch (err) {
      console.error("storage-usage error:", err);
      res.json({ used: 0, total: 1024 * 1024 * 1024 });
    }
  });

  // 2) 외부 URL → Storage 미러링
  app.post("/api/mirror-image", async (req, res) => {
    if (!(await ensureAuth(req, res))) return;

    const { url } = req.body as { url?: string };
    if (!url || !/^https?:\/\/.+/i.test(url)) {
      return res.status(400).json({ message: "올바른 URL을 입력하세요." });
    }

    try {
      const mirrored = await mirrorImageToStorage(url);
      res.json({ url: mirrored });
    } catch (err) {
      console.error("mirror-image error:", err);
      res.status(500).json({ message: "미러링 중 오류가 발생했습니다." });
    }
  });

  // 현재 로그인 상태. 로그인 후 클라이언트가 역할을 확인하는 데 쓴다.
  // (`/api/admin/verify` 는 x-admin-password 제거와 함께 없앴다. 이 경로가 대신한다.)
  app.get("/api/me", async (req, res) => {
    const user = await ensureAuth(req, res);
    if (!user) return;
    const { id, name, role } = user;
    res.json({ id, name, role });
  });

  app.post(api.posts.create.path, async (req, res) => {
    const user = await ensureAuth(req, res);
    if (!user) return;
    try {
      const { applyPassword, ...input } = api.posts.create.input.parse(req.body);
      const post = await storage.createPost({
        // 작성자를 남긴다. 담당 교사가 자기 활동 명단을 보려면 이 값이 있어야 한다.
        // x-admin-password 로 만든 옛 게시물은 이 값이 null 이라 admin 만 볼 수 있다.
        ...input,
        authorId: user.id,
        applyPasswordHash: applyPassword ? hashApplyPassword(applyPassword) : null,
      });
      res.status(201).json(toPublicPost(post));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  app.patch(api.posts.update.path, async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
      const { applyPassword, ...input } = api.posts.update.input.parse(req.body);
      const post = await storage.updatePost(id, {
        ...input,
        // 값이 없으면 기존 비밀번호를 그대로 둔다. 빈 문자열은 "사용 안 함"이라는 뜻.
        ...(applyPassword === undefined
          ? {}
          : { applyPasswordHash: applyPassword ? hashApplyPassword(applyPassword) : null }),
      });
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json(toPublicPost(post));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  app.delete(api.posts.delete.path, async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    const success = await storage.deletePost(id);
    if (!success) return res.status(404).json({ message: "Post not found" });

    // 이 게시물 링크를 가진 팝업 자동 삭제
    try {
      const postUrl = `/posts/${id}`;
      const allPopups = await storage.getPopups();
      for (const popup of allPopups) {
        if (popup.linkUrl?.includes(postUrl)) {
          await storage.deletePopup(popup.id);
        }
      }
    } catch (err) {
      console.error("popup auto-delete error:", err);
    }

    res.status(204).end();
  });


  // ── 활동 신청 (학생용, 공개 경로) ─────────────────────────
  // 계정을 만들지 않는다는 설계 결정 때문에 인증이 없다. 대신
  //  - 요청 제한 (rateLimit.ts)
  //  - (활동, 학년, 반, 번호) 유니크 제약
  //  - 활동별 신청 비밀번호(선택)
  // 이 세 가지가 방어선이다. 하나라도 빼면 안 된다.

  app.post(api.applications.apply.path, async (req, res) => {
    maybePrune();

    const ip = clientIp(req);
    const ipGate = await hitLimit(
      `apply:ip:${ip}`,
      LIMITS.applyPerIp.limit,
      LIMITS.applyPerIp.windowSec
    );
    if (!ipGate.ok) return tooManyRequests(res, ipGate);

    const post = await loadActivity(req, res);
    if (!post) return;

    let input;
    try {
      input = api.applications.apply.input.parse(req.body);
    } catch (err) {
      return badRequest(res, err);
    }

    // 화면의 배지와 같은 판정을 쓴다 (shared/activity.ts).
    // 규칙이 갈라지면 "신청 받는 중"으로 보이는데 서버가 거부하는 상황이 된다.
    const stage = activityStage(post);
    if (stage !== "open") {
      return res.status(400).json({ message: STAGE_REJECT_MESSAGE[stage] });
    }

    if (post.applyPasswordHash) {
      const pwKey = `apply:pw:${ip}`;
      const ok =
        !!input.applyPassword &&
        verifyApplyPassword(input.applyPassword, post.applyPasswordHash);

      // 시도할 때마다 세고 맞히면 지운다. 결과적으로 연속 실패만 누적된다.
      const pwGate = await hitLimit(
        pwKey,
        LIMITS.applyPasswordFail.limit,
        LIMITS.applyPasswordFail.windowSec
      );
      if (!pwGate.ok) return tooManyRequests(res, pwGate);

      if (!ok) {
        return res
          .status(403)
          .json({ message: "신청 비밀번호가 맞지 않습니다.", field: "applyPassword" });
      }
      await resetLimit(pwKey);
    }

    // 활동 비밀번호(교사가 걸어둔 것)는 저장하지 않는다.
    // studentPassword 는 applyToPost 안에서 해싱해 저장한다.
    const { applyPassword: _pw, agree: _agree, ...applicant } = input;
    const result = await applyToPost(post, applicant);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    res.status(201).json({
      application: toMyApplication(result.application, result.waitlistPosition),
      summary: await summaryFor(post),
    });
  });

  app.post(api.applications.lookup.path, async (req, res) => {
    const verified = await verifiedApplication(req, res);
    if (!verified) return;
    res.json({
      application: toMyApplication(verified.app, await positionOf(verified.app)),
      summary: await summaryFor(verified.post),
    });
  });

  app.post(api.applications.cancel.path, async (req, res) => {
    const verified = await verifiedApplication(req, res);
    if (!verified) return;

    const stage = activityStage(verified.post);
    if (stage === "ended") {
      return res.status(400).json({
        message: "종료된 활동은 취소할 수 없습니다. 담당 선생님께 문의해 주세요.",
      });
    }

    const { promoted } = await cancelApplication(verified.post, verified.app);
    res.json({ cancelled: true, promoted, summary: await summaryFor(verified.post) });
  });

  // 집계만 내려보낸다. 개별 신청자는 어떤 경우에도 포함하지 않는다.
  app.get(api.applications.summary.path, async (req, res) => {
    const post = await loadActivity(req, res);
    if (!post) return;
    res.json(await summaryFor(post));
  });

  app.get(api.applications.summaries.path, async (_req, res) => {
    try {
      res.json(await summariesForAll());
    } catch (err) {
      console.error("applications summary error:", err);
      res.status(500).json({ message: "신청 현황을 불러올 수 없습니다." });
    }
  });

  // ── 캘린더 (.ics) ────────────────────────────────────────
  // 활동 하나를 폰 캘린더에 담는 파일. 담긴 뒤로는 폰이 스스로 알림을 띄우고
  // 서버는 관여하지 않는다. 활동 정보만 들어가므로 공개 경로다.
  app.get(api.calendar.activity.path, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });

    const post = await storage.getPost(id);
    if (!post) return res.status(404).json({ message: "게시물을 찾을 수 없습니다." });

    // 프록시 뒤에 있으므로 원래 스킴은 헤더에서 본다. 설명에 넣을 링크에 쓴다.
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
    const origin = `${proto.split(",")[0]}://${req.get("host")}`;

    const event = postToEvent(post, origin);
    if (!event) {
      return res.status(400).json({ message: "활동 일시가 없어 캘린더에 담을 수 없습니다." });
    }

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(post.title, `activity-${post.id}`));
    // 활동 정보가 바뀔 수 있으니 오래 캐시하지 않는다.
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(buildCalendar([event]));
  });

  // ── 교사 초대 ────────────────────────────────────────────
  // 자율 가입을 열지 않으므로 교사 계정은 이 경로로만 생긴다.
  // 발급·목록·삭제는 admin 전용. 확인·수락은 링크를 가진 사람이 쓰는 공개 경로다.

  app.get(api.invites.list.path, requireAdmin(), async (_req, res) => {
    const rows = await listInvites();
    res.json(rows.map((i) => toInviteSummary(i)));
  });

  app.post(api.invites.create.path, requireAdmin(), async (req, res) => {
    try {
      const input = api.invites.create.input.parse(req.body);
      const { invite, token } = await createInvite(input);
      // 평문 토큰이 실리는 유일한 응답이다. 다시 볼 수 없다.
      res.status(201).json({
        invite: toInviteSummary(invite),
        link: `/invite/${token}`,
      });
    } catch (err) {
      return badRequest(res, err);
    }
  });

  app.delete(api.invites.remove.path, requireAdmin(), async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    const ok = await deleteInvite(id);
    if (!ok) return res.status(404).json({ message: "초대를 찾을 수 없습니다." });
    res.status(204).end();
  });

  // 토큰은 256비트 난수라 무차별 대입이 성립하지 않는다.
  // 그래도 공개 경로이므로 남용 방지용 IP 제한은 걸어 둔다.
  app.post(api.invites.check.path, async (req, res) => {
    const gate = await hitLimit(
      `invite:ip:${clientIp(req)}`,
      LIMITS.invitePerIp.limit,
      LIMITS.invitePerIp.windowSec
    );
    if (!gate.ok) return tooManyRequests(res, gate);

    try {
      const { token } = api.invites.check.input.parse(req.body);
      const found = await lookupInvite(token);
      if (!found.ok) return res.json({ valid: false, reason: found.reason });
      res.json({ valid: true, role: found.invite.role, memo: found.invite.memo });
    } catch (err) {
      return badRequest(res, err);
    }
  });

  app.post(api.invites.accept.path, async (req, res) => {
    const gate = await hitLimit(
      `invite:ip:${clientIp(req)}`,
      LIMITS.invitePerIp.limit,
      LIMITS.invitePerIp.windowSec
    );
    if (!gate.ok) return tooManyRequests(res, gate);

    let input;
    try {
      input = api.invites.accept.input.parse(req.body);
    } catch (err) {
      return badRequest(res, err);
    }

    const found = await lookupInvite(input.token);
    if (!found.ok) {
      const message =
        found.reason === "expired"
          ? "초대 링크가 만료되었습니다. 관리자에게 새 링크를 요청해 주세요."
          : found.reason === "used"
            ? "이미 사용된 초대 링크입니다."
            : "유효하지 않은 초대 링크입니다.";
      return res.status(400).json({ message });
    }

    const result = await acceptInvite(found.invite, input);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.status(201).json({ ok: true });
  });

  // ── 교사 계정 관리 (admin 전용) ──────────────────────────
  // 아이디 방식은 메일로 비밀번호를 재설정할 수 없다. 이 경로가 유일한 복구 수단이다.

  app.get(api.teachers.list.path, requireAdmin(), async (_req, res) => {
    res.json(await listTeachers());
  });

  app.post(api.teachers.resetPassword.path, requireAdmin(), async (req, res) => {
    const id = String(req.params.id);
    const result = await resetTeacherPassword(id);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    // 임시 비밀번호가 실리는 유일한 응답이다. 다시 볼 수 없다.
    res.json({ loginId: result.loginId, tempPassword: result.tempPassword });
  });

  // ── 교사용 신청자 명단 ───────────────────────────────────
  // 여기가 개별 신청자를 내보내는 유일한 인증 경로다.
  // admin 은 전부, teacher 는 자기가 올린 활동만 볼 수 있다.

  app.get(api.roster.list.path, async (req, res) => {
    const owned = await loadOwnedActivity(req, res);
    if (!owned) return;
    const entries = await listApplications(owned.post.id);
    res.json({
      postId: owned.post.id,
      title: owned.post.title,
      capacity: owned.post.capacity,
      entries: entries.map(toRosterEntry),
    });
  });

  app.patch(api.roster.update.path, async (req, res) => {
    const target = await loadOwnedApplication(req, res);
    if (!target) return;
    try {
      const { status } = api.roster.update.input.parse(req.body);
      const updated = await updateApplicationStatus(target.app, status);
      res.json(toRosterEntry(updated));
    } catch (err) {
      return badRequest(res, err);
    }
  });

  app.delete(api.roster.remove.path, async (req, res) => {
    const target = await loadOwnedApplication(req, res);
    if (!target) return;
    const ok = await removeApplication(target.app.id);
    if (!ok) return res.status(404).json({ message: "신청을 찾을 수 없습니다." });
    res.status(204).end();
  });

  // ── 팝업 CRUD ────────────────────────────────────────────
  app.get("/api/popups", async (_req, res) => {
    try {
      const list = await storage.getActivePopups();
      res.json(list);
    } catch (err) {
      res.status(500).json({ message: "팝업을 불러올 수 없습니다." });
    }
  });

  app.get("/api/admin/popups", async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    try {
      const list = await storage.getPopups();
      res.json(list);
    } catch (err) {
      res.status(500).json({ message: "팝업을 불러올 수 없습니다." });
    }
  });

  app.post("/api/admin/popups", async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    try {
      const popup = await storage.createPopup(req.body);
      res.status(201).json(popup);
    } catch (err) {
      res.status(500).json({ message: "팝업 생성에 실패했습니다." });
    }
  });

  app.patch("/api/admin/popups/:id", async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    try {
      const popup = await storage.updatePopup(id, req.body);
      if (!popup) return res.status(404).json({ message: "팝업을 찾을 수 없습니다." });
      res.json(popup);
    } catch (err) {
      res.status(500).json({ message: "팝업 수정에 실패했습니다." });
    }
  });

  app.delete("/api/admin/popups/:id", async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const ok = await storage.deletePopup(id);
    if (!ok) return res.status(404).json({ message: "팝업을 찾을 수 없습니다." });
    res.status(204).end();
  });

  // Seed data
  try {
    const existingPosts = await storage.getPosts();
    if (existingPosts.length === 0) {
      await storage.createPost({ title: "미사강변고등학교 과학중점고 선정 안내", content: "우리 학교가 과학중점고등학교로 선정되었습니다.", category: "home" });
      await storage.createPost({ title: "물리/화학/생명과학/지구과학 실험실 소개", content: "최신식 기자재를 갖춘 4개의 전용 과학 실험실과 리소스룸을 운영하고 있습니다.", category: "lab_intro" });
      await storage.createPost({ title: "2024학년도 과학중점반 탐구 프로젝트", content: "학생들이 주도적으로 연구 주제를 선정하고 1년간 탐구하는 장기 프로젝트 활동입니다.", category: "science_class" });
    }
  } catch (error) {
    console.error("Failed to seed database:", error);
  }

  return httpServer;
}
