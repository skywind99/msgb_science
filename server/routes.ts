import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { api } from "../shared/routes.js";
import {
  AI_FILL_MESSAGES,
  AI_PROVIDERS,
  toMyApplication,
  toPublicPost,
  toInviteSummary,
  toRosterEntry,
  type AiFillErrorCode,
  type AiKeyAdminEntry,
  type AiKeysAdminResponse,
  type AiProvider,
  type Application,
  type Post,
} from "../shared/schema.js";
import { activityStage, STAGE_REJECT_MESSAGE } from "../shared/activity.js";
import { buildCalendar, contentDisposition, eventToGoogleUrl } from "./calendar.js";
import { toCalendarEvent } from "../shared/calendarEvent.js";
import { z } from "zod";
import { mirrorImageToStorage, uploadBufferToStorage } from "./imageUpload.js";
import { ensureAuth, requireAdmin, resolveUser, type AuthedRequest, type AuthUser } from "./auth.js";
import { canManagePost, manageOutcome } from "../shared/postPermissions.js";
import { popupPointsToPost } from "../shared/postLink.js";
import { clearKey, loadKey, loadKeyStatus, saveKey } from "./aiKeys.js";
import { hasUsableSecret } from "./aiCrypto.js";
import {
  callWithFallback,
  checkImageSize,
  isAllowedImageUrl,
  todayInKst,
  type AiFillMode,
} from "./aiProviders.js";
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
import { aiFillResultSchema, aiProviderSchema } from "../shared/aiForms.js";
import { resolveAiYears } from "../shared/aiDates.js";
import { resetPasswordBodySchema } from "../shared/inviteForms.js";
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
  refundLimit,
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

/**
 * AI 오류를 code 와 교사용 문구로 함께 보낸다.
 *
 * code 로 구분하는 이유: 교사 화면과 AI 설정 팝업의 안내가 다르고, 관리자가
 * 손쓸 수 있는 경우와 아닌 경우를 나눠야 한다.
 * **사유를 응답에 담지 않는다** — 키 조각이나 요청 내용이 새지 않게.
 */
function aiError(res: Response, status: number, code: AiFillErrorCode) {
  return res.status(status).json({ code, message: AI_FILL_MESSAGES[code] });
}

/** 공급자 이름을 사람이 읽는 말로. 교사가 "Groq" 을 몰라도 어디가 막혔는지 보인다. */
const PROVIDER_LABEL: Record<AiProvider, string> = { groq: "Groq", gemini: "Gemini" };

/**
 * 공급자가 한도를 돌려줬을 때.
 *
 * **우리 시간당 20회 제한과 문구가 겹치면 안 된다.** 그쪽은
 * "요청이 너무 많습니다. N초 후에…" 이고, 이쪽은 "AI 사용량이 한도를 넘었어요" 다.
 * 둘 다 429 라서 문구가 유일한 구분점이다.
 *
 * 대기 시간이 아주 길면 초 단위로 알려 줘야 소용이 없다. 분·시간으로 세는 대신
 * "오늘은 다 썼다" 로 바꾼다 — 교사가 기다릴지 포기할지 바로 정할 수 있다.
 */
const LONG_WAIT_SEC = 10 * 60;

function providerRateLimited(res: Response, provider: AiProvider, retryAfterSec?: number) {
  const who = PROVIDER_LABEL[provider];
  const message =
    retryAfterSec === undefined
      ? `AI 사용량이 한도를 넘었어요 (${who}). 잠시 후 다시 시도해 주세요.`
      : retryAfterSec > LONG_WAIT_SEC
        ? `오늘은 AI 사용량을 다 썼어요 (${who}). 내일 다시 시도해 주세요.`
        : `AI 사용량이 한도를 넘었어요 (${who}). 약 ${retryAfterSec}초 후에 다시 시도해 주세요.`;

  if (retryAfterSec !== undefined) res.setHeader("Retry-After", String(retryAfterSec));
  // **키와 요청 내용은 담지 않는다.** 공급자 이름과 초만 나간다.
  return res.status(429).json({ code: "rate_limited", message, provider, retryAfter: retryAfterSec });
}

/**
 * admin 이 보는 키 상태. **키 값은 절대 담지 않는다.**
 * 갱신자 id 를 이름으로 바꿔 보여준다 — uuid 만 보면 누군지 알 수 없다.
 */
async function adminKeyView(): Promise<AiKeysAdminResponse> {
  const status = await loadKeyStatus();

  // 교사 목록에서 이름을 찾는다. 이 경로는 admin 전용이라 추가 노출이 없다.
  let names = new Map<string, string>();
  try {
    for (const t of await listTeachers()) names.set(t.id, t.name);
  } catch {
    // 이름을 못 찾아도 상태는 보여준다. uuid 만 남는다.
    names = new Map();
  }

  const providers = {} as Record<AiProvider, AiKeyAdminEntry>;
  for (const provider of AI_PROVIDERS) {
    const s = status[provider];
    providers[provider] = {
      state: s.state,
      updatedBy: s.updatedBy,
      updatedByName: s.updatedBy ? names.get(s.updatedBy) ?? null : null,
      updatedAt: s.updatedAt,
    };
  }
  return { secretConfigured: hasUsableSecret(), providers };
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

  if (!canManagePost(user, post)) {
    res.status(403).json({ message: "이 활동의 명단을 볼 권한이 없습니다." });
    return null;
  }
  return { post, user };
}

/**
 * 게시물을 관리할 권한이 있는지 확인하고 글을 돌려준다. **삭제가 쓴다.**
 *
 * `loadOwnedActivity` 를 쓸 수 없다. 그 안의 `loadActivity` 가 신청을 받지 않는
 * 글을 **400 "신청을 받지 않는 게시물입니다"** 로 끊는다. 공지 글을 지우려는
 * 교사가 그 문구를 받으면 왜 안 지워지는지 알 수 없다.
 *
 * **404 를 403 보다 먼저 본다.** 없는 글에 403 을 주면 "권한이 없다" 가 곧
 * "그 글은 있다" 는 뜻이 된다. 게시물 제목은 어차피 공개라 숨길 것이 없고,
 * 교사에게는 "없는 글" 과 "내 글이 아닌 글" 이 구분돼야 한다.
 * (명단 경로는 반대로 권한을 먼저 본다 — 거기는 학생 개인정보가 걸려 있다.)
 */
async function loadPostForManage(
  req: Request,
  res: Response
): Promise<{ post: Post; user: AuthUser } | null> {
  const user = await ensureAuth(req, res);
  if (!user) return null; // 401 은 ensureAuth 가 이미 보냈다

  const id = parseInt(String(req.params.id));
  // 숫자가 아니면 조회할 것도 없다. `manageOutcome` 과 같은 404 를 준다.
  const post = isNaN(id) ? null : ((await storage.getPost(id)) ?? null);

  const outcome = manageOutcome(user, post);
  if (outcome.status !== 200) {
    res.status(outcome.status).json({ message: outcome.message });
    return null;
  }
  return { post: post!, user };
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
  if (!canManagePost(user, found.post)) {
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
  /**
   * 로그인한 요청에만 `canDelete` 를 붙인다.
   *
   * `ensureAuth` 가 아니라 `resolveUser` 를 쓴다 — 목록은 공개 경로이고,
   * 토큰이 없거나 틀렸으면 **401 을 내지 않고 그냥 비로그인으로 본다.**
   *
   * 응답이 사용자마다 달라지므로 **캐시를 막아야 한다.** 막지 않으면 공용 캐시나
   * 브라우저 캐시가 로그인한 사람의 본문을 비로그인에게 줄 수 있다.
   */
  async function withCanDelete(req: Request, res: Response, posts: Post[]) {
    const user = await resolveUser(req);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Authorization");
    if (!user) return posts.map(toPublicPost);
    return posts.map((p) => ({ ...toPublicPost(p), canDelete: canManagePost(user, p) }));
  }

  // 게시물 응답은 반드시 toPublicPost 를 거친다.
  // applyPasswordHash 와 authorId 를 밖으로 내보내지 않는다.
  app.get(api.posts.list.path, async (req, res) => {
    const category = req.query.category as string | undefined;
    const postsList = await storage.getPosts(category);
    res.json(await withCanDelete(req, res, postsList));
  });

  app.get(api.posts.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ message: "Invalid ID" });
    const post = await storage.getPost(id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const [one] = await withCanDelete(req, res, [post]);
    res.json(one);
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

  /**
   * 삭제는 **작성자와 `admin` 만.** 수정(PATCH)은 로그인한 교사 모두에게 열어 둔다 —
   * 오타를 고치는 일은 서로 도와야 하지만, 지우는 것은 되돌릴 수 없다.
   */
  app.delete(api.posts.delete.path, async (req, res) => {
    const owned = await loadPostForManage(req, res);
    if (!owned) return;
    const id = owned.post.id;
    const success = await storage.deletePost(id);
    if (!success) return res.status(404).json({ message: "Post not found" });

    // 이 게시물을 가리키는 팝업도 같이 지운다.
    //
    // **`includes` 로 비교하지 않는다.** 예전에는 `linkUrl.includes("/posts/1")`
    // 이어서, 1번 글을 지우면 `/posts/12`·`/posts/123` 을 가리키던 팝업까지
    // 사라졌다. 번호를 정확히 뽑아 같은 번호일 때만 지운다.
    try {
      const allPopups = await storage.getPopups();
      for (const popup of allPopups) {
        if (popupPointsToPost(popup.linkUrl, id)) {
          await storage.deletePopup(popup.id);
        }
      }
    } catch (err) {
      // 팝업 정리가 실패해도 게시물 삭제는 되돌리지 않는다. 남은 팝업은
      // 죽은 링크가 되지만, 글이 지워진 채 응답이 500 이 되는 것보다 낫다.
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

  // ── 캘린더 ───────────────────────────────────────────────
  // 활동 하나를 폰 캘린더에 담는다. 담긴 뒤로는 폰이 스스로 알림을 띄우고
  // 서버는 관여하지 않는다. 활동 정보만 들어가므로 공개 경로다.
  //
  // 두 경로가 필요한 이유는 `shared/routes.ts` 의 주석 참고 — 안드로이드 크롬은
  // .ics 를 다운로드해 버려서 구글 캘린더 링크가 있어야 한다.

  /** 요청에서 이벤트를 만든다. 못 만들면 응답까지 보내고 null 을 반환한다. */
  const eventFromRequest = async (req: Request, res: Response) => {
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
    // 프록시 뒤에 있으므로 원래 스킴은 헤더에서 본다. 설명에 넣을 링크에 쓴다.
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
    const origin = `${proto.split(",")[0]}://${req.get("host")}`;

    const event = toCalendarEvent(post, origin);
    if (!event) {
      res.status(400).json({ message: "활동 일시가 없어 캘린더에 담을 수 없습니다." });
      return null;
    }
    return { post, event };
  };

  app.get(api.calendar.activity.path, async (req, res) => {
    const found = await eventFromRequest(req, res);
    if (!found) return;

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      contentDisposition(found.post.title, `activity-${found.post.id}`)
    );
    // 활동 정보가 바뀔 수 있으니 오래 캐시하지 않는다.
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(buildCalendar([found.event]));
  });

  // 구글 캘린더로 넘긴다. 주소를 클라이언트에서 만들지 않고 여기서 302 하는 이유는
  // 설명 문구(마감·정원·링크)를 한 곳에서만 관리하기 위해서다.
  app.get(api.calendar.google.path, async (req, res) => {
    const found = await eventFromRequest(req, res);
    if (!found) return;
    res.redirect(302, eventToGoogleUrl(found.event));
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

  /**
   * 교사 비밀번호 재설정. **아이디 방식의 유일한 복구 수단이다** — 지우지 말 것
   * (`shared/teacherId.ts` 참고).
   *
   * `password` 를 비우면 서버가 무작위로 만들어 한 번만 보여준다. 넣으면 그 값으로
   * 바꾸고 **응답에는 담지 않는다.**
   *
   * `requireAdmin()` 이라 역할만 본다. **admin 끼리 서로의 비밀번호를 바꿀 수 있고
   * 자기 자신도 대상이 된다.** 그대로 둔 것이다 — admin 이 둘 이상일 때 한 명이
   * 잊어도 다른 한 명이 풀어줄 수 있는 유일한 길이다.
   */
  app.post(api.teachers.resetPassword.path, requireAdmin(), async (req, res) => {
    const id = String(req.params.id);

    // **여기서 반드시 검사한다.** 화면 검사는 우회할 수 있고, Supabase 쪽 최소
    // 길이는 6자라서 그냥 넘기면 6자 비밀번호가 들어간다.
    let password: string | undefined;
    try {
      password = resetPasswordBodySchema.parse(req.body ?? {}).password;
    } catch (err) {
      if (err instanceof z.ZodError) {
        // 입력값은 담지 않는다. 비밀번호가 오류 응답에 섞이면 안 된다.
        return res.status(400).json({ message: err.errors[0].message, field: "password" });
      }
      throw err;
    }

    const result = await resetTeacherPassword(id, password);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    // 임시 비밀번호가 실리는 유일한 응답이다. 다시 볼 수 없다.
    // 관리자가 직접 지정한 경우에는 `null` 이다.
    res.json({ loginId: result.loginId, tempPassword: result.tempPassword });
  });

  // ── AI 보조 입력 ─────────────────────────────────────────
  // 키의 주인은 사이트다. 교사별 키는 없고, 등록·삭제는 admin 만 한다.
  // 관리자 판정은 초대·교사 계정 라우트와 **같은 `requireAdmin()`** 을 쓴다.

  /**
   * 교사 화면이 보는 것. "쓸 수 있는가" 뿐이다.
   *
   * **어떤 경우에도 500 을 내지 않는다.** 테이블이 없거나 DB 가 흔들려도
   * 전부 false 를 돌려준다 — AI 버튼만 비활성이어야 하고 글쓰기 화면이
   * 통째로 막히면 안 된다. (요청 제한과 반대로 "열리는 쪽" 으로 실패한다.)
   */
  app.get(api.ai.status.path, async (req, res) => {
    if (!(await ensureAuth(req, res))) return;
    try {
      const status = await loadKeyStatus();
      res.json({ groq: status.groq.state === "ok", gemini: status.gemini.state === "ok" });
    } catch (err) {
      console.error(
        "[ai/status] 상태를 읽지 못했습니다:",
        err instanceof Error ? err.message : "알 수 없는 오류"
      );
      res.json({ groq: false, gemini: false });
    }
  });

  /** admin 전용. 상태와 누가 언제 바꿨는지. **키 값은 들어 있지 않다.** */
  app.get(api.adminAiKeys.get.path, requireAdmin(), async (_req, res) => {
    res.json(await adminKeyView());
  });

  app.put(api.adminAiKeys.put.path, requireAdmin(), async (req, res) => {
    const user = (req as AuthedRequest).authUser;
    if (!user) return res.status(401).json({ message: "로그인이 필요합니다." });

    let input;
    try {
      input = api.adminAiKeys.put.input.parse(req.body);
    } catch (err) {
      return badRequest(res, err);
    }

    // 비밀값이 없으면 암호화할 수 없다. 평문을 넣는 일은 없어야 한다.
    const stored = await saveKey(input.provider, input.key, user.id);
    if (!stored) {
      return res.status(503).json({
        message:
          "서버에 AI_KEY_SECRET 이 설정되지 않아 키를 저장할 수 없습니다. 환경변수를 넣고 재배포해 주세요.",
      });
    }
    res.json(await adminKeyView());
  });

  app.delete(api.adminAiKeys.remove.path, requireAdmin(), async (req, res) => {
    const user = (req as AuthedRequest).authUser;
    if (!user) return res.status(401).json({ message: "로그인이 필요합니다." });

    const parsed = aiProviderSchema.safeParse(req.query.provider);
    if (!parsed.success) {
      return res.status(400).json({ message: "공급자를 지정해 주세요.", field: "provider" });
    }
    await clearKey(parsed.data, user.id);
    res.json(await adminKeyView());
  });

  /**
   * 본문·이미지에서 활동 정보를 뽑는다.
   *
   * **5단계에서 화면과 연결한다.** 지금은 인증·요청 제한·검증·이미지 주소 허용·
   * 키 조회까지 하고, 실제 공급자 호출은 형식 확인 전이라 막혀 있다
   * (`server/aiProviders.ts` 의 `확인 전` 주석).
   */
  app.post(api.ai.fill.path, async (req, res) => {
    // 로그인을 먼저 통과시킨다. 그래서 아래에서 user 가 없는 경우가 없고,
    // 요청 제한 키를 IP 로 대체할 일도 없다.
    const user = await ensureAuth(req, res);
    if (!user) return;

    /**
     * **먼저 세고, 공급자를 부르지 않았으면 되돌린다.**
     *
     * 세는 목적은 비용과 남용을 막는 것이다. 공급자에 닿지도 않은 요청은 비용이
     * 0 이므로 깎을 이유가 없다. 특히 공급자가 429 를 준 경우에 우리 한도까지
     * 같이 소진하면, 공급자가 풀려도 교사가 우리 쪽에 막힌다.
     *
     * 순서를 뒤집어 "부른 뒤에 센다" 로 하면 동시 요청이 한꺼번에 통과해 한도를
     * 넘는다. 그래서 세는 것이 먼저다.
     */
    const limitKey = `ai:${user.id}`;
    const gate = await hitLimit(limitKey, LIMITS.aiFill.limit, LIMITS.aiFill.windowSec);
    if (!gate.ok) return tooManyRequests(res, gate);

    /** 공급자를 부르지 않았거나 공급자가 한도를 돌려준 경우. 센 것을 물린다. */
    const refund = () => refundLimit(limitKey);

    let input;
    try {
      input = api.ai.fill.input.parse(req.body);
    } catch (err) {
      await refund();
      return badRequest(res, err);
    }

    const mode: AiFillMode = input.imageUrl ? "image" : "text";

    if (mode === "image") {
      // 공급자가 URL 을 직접 가져가므로 우리가 바이트를 보지 않는다.
      // 그래서 도메인과 용량을 **보내기 전에** 막는다.
      if (!isAllowedImageUrl(input.imageUrl!)) {
        await refund();
        return aiError(res, 400, "image_rejected");
      }

      const size = await checkImageSize(input.imageUrl!);
      if (!size.ok) {
        console.error(`[ai/fill] 이미지 거부: ${size.reason}`);
        await refund();
        return aiError(res, 400, "image_rejected");
      }
    }

    // 쓸 수 있는 키만 모은다. 하나만 등록돼 있어도 동작해야 한다.
    const [groq, gemini] = await Promise.all([loadKey("groq"), loadKey("gemini")]);
    const keys: Partial<Record<"groq" | "gemini", string>> = {};
    if (groq.key) keys.groq = groq.key;
    if (gemini.key) keys.gemini = gemini.key;

    if (Object.keys(keys).length === 0) {
      // "등록되지 않음" 과 "읽을 수 없음" 을 구분해 알려준다.
      const unreadable = groq.state === "unreadable" || gemini.state === "unreadable";
      await refund();
      return aiError(res, 503, unreadable ? "key_unreadable" : "key_missing");
    }

    const { result } = await callWithFallback(mode, keys, {
      mode,
      text: input.text,
      imageUrl: input.imageUrl,
      today: todayInKst(),
    });

    if (!result.ok) {
      // 사유는 로그에만. 요청 내용과 키는 남기지 않는다.
      console.error(`[ai/fill] ${result.provider} 실패: ${result.reason}`);
      if (result.code === "rate_limited") {
        // 공급자가 거절해 아무 일도 일어나지 않았다. 우리 한도까지 깎지 않는다.
        await refund();
        return providerRateLimited(res, result.provider, result.retryAfterSec);
      }
      // bad_response · model_gone · key_rejected 는 실제로 불렀으므로 센 채로 둔다.
      return aiError(res, 502, result.code);
    }

    // **공급자 응답을 믿지 않는다.** Gemini 는 스키마로 모양을 강제할 수 있지만
    // Groq 은 "JSON 으로 답하라" 수준이고, 둘 다 형식이 어긋난 값을 낼 수 있다.
    // 여기서 거르지 않으면 "2026년 봄" 같은 문자열이 날짜 칸으로 들어간다.
    const checked = aiFillResultSchema.safeParse(result.data);
    if (!checked.success) {
      console.error(`[ai/fill] ${result.provider} 응답 형식 오류`);
      return aiError(res, 502, "bad_response");
    }

    // **연도는 서버가 정한다.** 모델은 "적혀 있었는지" 만 알려준다.
    // 연도가 적혀 있었으면 과거여도 그대로 둔다 — 지난 행사를 기록으로 올리는
    // 경우가 있어서, 미래로 밀면 멀쩡한 날짜를 망친다. 과거는 화면이 경고한다.
    const resolved = resolveAiYears(checked.data, todayInKst());

    res.json({ ...checked.data, ...resolved });
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
