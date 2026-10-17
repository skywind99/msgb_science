import { activityStage, type ActivityStage, type ActivityTiming } from "./activity.js";
import { firstText } from "./postBlocks.js";
import type { ContentBlock } from "./schema.js";

/**
 * 메인 화면 보기 모드(기본 / 카드보드 / 뉴스 / TV)가 쓰는 **순수 함수 모음**.
 *
 * 화면이 아니라 여기 둔 이유는 하나다 — **브라우저 없이 시험해야** 하기 때문이다.
 * 필터 수, 페이지 경계, 저장값 해석, TV 표시 대상은 틀려도 화면이 그럴듯해 보인다.
 * 글이 하나 빠지거나 페이지가 하나 모자란 것은 눌러 보기 전에는 모른다.
 *
 * **판정 로직을 새로 만들지 않는다.** 활동 단계는 `shared/activity.ts` 의
 * `activityStage`, 본문 미리보기는 `shared/postBlocks.ts` 의 `firstText` 를 그대로
 * 쓴다. 같은 것을 두 번 구현하면 화면마다 다른 답이 나온다.
 */

// ── 보기 모드 ─────────────────────────────────────────────

/** 저장되는 보기 모드. `tv` 는 **여기 없다** — 저장하지 않고 `/tv` 로 이동만 한다. */
export const VIEW_MODES = ["default", "board", "news"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const DEFAULT_VIEW: ViewMode = "default";

/** localStorage 키. 값과 함께 한 곳에 둬서 흩어지지 않게 한다. */
export const VIEW_STORAGE_KEY = "msgb_home_view";
export const PER_PAGE_STORAGE_KEY = "msgb_board_per_page";

/**
 * 저장값을 보기 모드로 읽는다. **모르는 값은 기본값이다.**
 *
 * `null`(저장소가 막혔거나 처음), 오래된 값, 손으로 고친 값이 모두 올 수 있다.
 * `"tv"` 가 들어와도 기본값으로 본다 — TV 는 저장하지 않기로 했으므로 그 값이
 * 남아 있다면 예전 버전이 쓴 것이고, 메인을 열 때마다 TV 로 튀면 빠져나올 수 없다.
 */
export function parseViewMode(raw: string | null | undefined): ViewMode {
  if (!raw) return DEFAULT_VIEW;
  return (VIEW_MODES as readonly string[]).includes(raw) ? (raw as ViewMode) : DEFAULT_VIEW;
}

// ── 한 화면 개수 ──────────────────────────────────────────

export const PER_PAGE_OPTIONS = [4, 6, 9, 12] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

export const DEFAULT_PER_PAGE: PerPage = 6;

/** 저장값을 개수로 읽는다. 목록에 없는 숫자와 숫자가 아닌 값은 기본값이다. */
export function parsePerPage(raw: string | number | null | undefined): PerPage {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? (n as PerPage) : DEFAULT_PER_PAGE;
}

/**
 * 개수 ↔ 카드 모양. 열 수는 Tailwind 클래스로 화면이 정하고, **모양만** 여기서 정한다.
 *
 * 4개는 크게 보여주므로 정보를 더 담고, 12개는 작아서 제목과 날짜만 남긴다.
 */
export type CardShape = "info" | "standard" | "small";

export function cardShapeFor(perPage: PerPage): CardShape {
  if (perPage === 4) return "info";
  if (perPage === 12) return "small";
  return "standard";
}

// ── 카드보드 대상 선정 ────────────────────────────────────

/** 카드보드·TV 가 쓰는 글의 최소 모양. `PublicPost` 를 그대로 요구하지 않는다. */
export type BoardPost = ActivityTiming & {
  id: number;
  title: string;
  category: string;
  applyEnabled: boolean;
  imageUrl?: string | null;
  content?: string | null;
  blocks?: ContentBlock[] | null;
  createdAt?: Date | string | null;
};

/** 최신순. `createdAt` 이 없으면 id 가 큰 쪽을 새 글로 본다. */
function byNewest(a: BoardPost, b: BoardPost): number {
  const at = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
  if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) return bt - at;
  return b.id - a.id;
}

/**
 * 카드보드에 올릴 글. **학교 새소식(`home`) + 활동 글(`applyEnabled`)** 만.
 *
 * 그 밖의 게시판 글은 넣지 않는다 — 카드보드는 "지금 볼 것" 을 모으는 화면이고,
 * 과학실 소개처럼 바뀌지 않는 글이 섞이면 새 글이 묻힌다.
 *
 * **숨긴 게시판의 글은 뺀다.** 메뉴에서 치운 게시판의 글이 메인에 남아 있으면
 * 숨긴 것이 아니다.
 */
export function boardItems(
  posts: readonly BoardPost[],
  hiddenCategoryIds: readonly string[] = []
): BoardPost[] {
  const hidden = new Set(hiddenCategoryIds);
  return posts
    .filter((p) => !hidden.has(p.category))
    .filter((p) => p.category === "home" || p.applyEnabled)
    .slice()
    .sort(byNewest);
}

// ── 필터 ──────────────────────────────────────────────────

export const BOARD_FILTERS = ["all", "news", "activity", "open"] as const;
export type BoardFilter = (typeof BOARD_FILTERS)[number];

export const BOARD_FILTER_LABEL: Record<BoardFilter, string> = {
  all: "전체",
  news: "학교 새소식",
  activity: "활동",
  open: "신청 받는 중",
};

/**
 * 필터 적용.
 *
 * `open` 은 **`activityStage` 가 정한다** — 여기서 날짜를 다시 비교하지 않는다.
 * 그 함수가 종료·신청 전·마감을 이미 순서대로 가린다.
 */
export function applyBoardFilter(
  items: readonly BoardPost[],
  filter: BoardFilter,
  now = new Date()
): BoardPost[] {
  switch (filter) {
    case "news":
      return items.filter((p) => p.category === "home");
    case "activity":
      return items.filter((p) => p.applyEnabled);
    case "open":
      return items.filter((p) => p.applyEnabled && activityStage(p, now) === "open");
    default:
      return items.slice();
  }
}

/** 칩에 붙는 글 수. 네 개를 한 번에 세어 화면이 같은 기준을 쓰게 한다. */
export function countByFilter(
  items: readonly BoardPost[],
  now = new Date()
): Record<BoardFilter, number> {
  return {
    all: items.length,
    news: applyBoardFilter(items, "news", now).length,
    activity: applyBoardFilter(items, "activity", now).length,
    open: applyBoardFilter(items, "open", now).length,
  };
}

// ── 페이지 ────────────────────────────────────────────────

export type PageSlice<T> = {
  rows: T[];
  /** 전체 글 수 */
  total: number;
  /** 1부터. 보정된 값이다. */
  page: number;
  /** 최소 1. 글이 0개여도 "1 / 1" 로 보여준다. */
  pages: number;
};

/** 1..pages 안으로 가둔다. 필터를 바꿔 목록이 줄었을 때 쓴다. */
export function clampPage(page: number, pages: number): number {
  const max = Math.max(1, pages);
  if (!Number.isFinite(page)) return 1;
  return Math.min(max, Math.max(1, Math.trunc(page)));
}

/**
 * 한 페이지를 잘라낸다.
 *
 * `pages` 를 최소 1 로 두는 이유는 화면이 "0 / 0" 을 보여주지 않게 하려는 것이다.
 * 글이 없을 때는 "1 / 1" 에 빈 상태 안내가 뜬다.
 */
export function pageSlice<T>(items: readonly T[], perPage: number, page: number): PageSlice<T> {
  const size = Math.max(1, Math.trunc(perPage));
  const pages = Math.max(1, Math.ceil(items.length / size));
  const safe = clampPage(page, pages);
  const start = (safe - 1) * size;
  return { rows: items.slice(start, start + size), total: items.length, page: safe, pages };
}

// ── 표지 ──────────────────────────────────────────────────

/** 길면 자른다. 표지 자리에 2~3줄로 들어갈 만큼만. */
const COVER_TEXT_MAX = 160;

/**
 * 대표 이미지가 없는 글의 표지 자리에 넣을 글귀.
 *
 * 본문 첫 글상자 → 옛 `content` 순서로 본다. 둘 다 없으면 빈 문자열이고, 화면은
 * 그때 회색 배경만 보여준다. **블록에서 뽑는 일은 `firstText` 가 한다** — 블록
 * 구조를 아는 곳을 늘리지 않는다.
 */
export function coverFallback(post: Pick<BoardPost, "blocks" | "content">): string {
  const fromBlocks = post.blocks ? firstText(post.blocks) : "";
  const raw = (fromBlocks || post.content || "").replace(/\s+/g, " ").trim();
  return raw.length > COVER_TEXT_MAX ? raw.slice(0, COVER_TEXT_MAX) + "…" : raw;
}

// ── 뉴스 ──────────────────────────────────────────────────

/**
 * 서버가 돌려주는 기사 하나.
 *
 * `placeholder` 는 **파싱이 0건일 때 서버가 붙이는 표식**이다. 이게 없으면 화면이
 * "기사를 못 가져왔다" 와 "기사가 하나뿐이다" 를 구분할 수 없다 — 서버가 0건일 때
 * 가짜 항목 1건을 돌려주기 때문이다.
 *
 * **선택 항목으로 둔 것이 중요하다.** 기존 히어로 뉴스 카드는 제목·요약·이미지·
 * 링크·날짜만 읽으므로, 이 필드가 붙어도 그 화면은 달라지지 않는다.
 */
export type NewsItem = {
  title: string;
  summary: string;
  imageUrl: string | null;
  link: string;
  date: string;
  placeholder?: boolean;
};

/**
 * 뉴스를 보여줄 수 있는 상태인가.
 *
 * 뉴스 모드와 TV 가 같은 판정을 써야 한다. 한쪽만 실패 화면을 띄우면 같은 데이터로
 * 두 화면이 다른 말을 한다.
 */
export type NewsState = "ok" | "empty" | "failed";

export function newsState(items: readonly NewsItem[] | null | undefined): NewsState {
  if (!items) return "failed";
  if (items.length === 0) return "empty";
  // 가짜 항목만 왔으면 실패다. 섞여 올 일은 없지만 하나라도 진짜가 있으면 보여준다.
  return items.every((i) => i.placeholder === true) ? "failed" : "ok";
}

/** 가짜 항목을 걸러낸 목록. 화면은 늘 이걸 그린다. */
export function realNews(items: readonly NewsItem[] | null | undefined): NewsItem[] {
  return (items ?? []).filter((i) => i.placeholder !== true);
}

/** 큰 기사 1 + 목록. 서버 상한이 6이라 목록은 최대 5다. */
export function splitNews(items: readonly NewsItem[] | null | undefined): {
  lead: NewsItem | null;
  rest: NewsItem[];
} {
  const real = realNews(items);
  return { lead: real[0] ?? null, rest: real.slice(1, 6) };
}

// ── TV ────────────────────────────────────────────────────

/** 새소식은 이 개수까지만. TV 는 멀리서 보는 화면이라 오래된 글이 돌 필요가 없다. */
export const TV_NEWS_POST_LIMIT = 10;

/** TV 카드에 올릴 활동 단계. **마감·종료는 넣지 않는다.** */
const TV_ACTIVITY_STAGES: readonly ActivityStage[] = ["open", "before"];

/**
 * TV 카드 줄에 올릴 글.
 *
 * 새소식 최신 10건 + **신청 받는 중·신청 예정** 활동. 마감과 종료는 뺀다 — TV 는
 * "지금 신청할 것" 을 알리는 화면이고, 마감된 활동이 섞이면 QR 이 없는 카드가 돈다.
 *
 * 숨긴 게시판은 `boardItems` 가 이미 뺀다.
 */
export function tvItems(
  posts: readonly BoardPost[],
  hiddenCategoryIds: readonly string[] = [],
  now = new Date()
): BoardPost[] {
  const all = boardItems(posts, hiddenCategoryIds);

  const news = all.filter((p) => p.category === "home").slice(0, TV_NEWS_POST_LIMIT);
  const activities = all.filter(
    (p) => p.applyEnabled && TV_ACTIVITY_STAGES.includes(activityStage(p, now))
  );

  // 새소식과 활동이 겹칠 수 있다(home 게시판에 올린 활동 글). 한 번만 넣는다.
  const seen = new Set<number>();
  return [...activities, ...news].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/**
 * QR 에 넣을 주소. **전체 주소여야 한다** — 휴대폰 카메라가 읽는 값이라
 * 상대 경로(`/posts/12`)로는 어디로 가야 할지 알 수 없다.
 *
 * 팝업 링크(`postPopupLink`)가 상대 경로인 것과 정반대 이유다. 그쪽은 같은
 * 브라우저 안에서 열리고, 이쪽은 다른 기기에서 열린다.
 */
export function tvQrUrl(origin: string | null | undefined, postId: number): string | null {
  if (!origin) return null;
  try {
    // `new URL` 로 한 번 거른다. 쓰레기 문자열이 QR 로 들어가면 아무도 모른다.
    return new URL(`/posts/${postId}`, origin).toString();
  } catch {
    return null;
  }
}

// ── 회전 ──────────────────────────────────────────────────

/**
 * 순환 인덱스. **0건에서 `NaN` 과 음수를 막는다.**
 *
 * `i % 0` 은 `NaN` 이고, 음수 `i` 에 `%` 를 쓰면 음수가 나온다. 둘 다 배열 접근이
 * `undefined` 가 되어 TV 가 빈 화면으로 멈춘다.
 */
export function wrapIndex(i: number, len: number): number {
  if (!Number.isFinite(i) || len <= 0) return 0;
  const n = Math.trunc(i) % len;
  return n < 0 ? n + len : n;
}

/**
 * 카드 줄을 돌릴지, 세워 둘지.
 *
 * **화면에 다 들어가면 돌리지 않는다.** 네 장을 5초마다 밀면 같은 카드가 계속
 * 지나가는 것처럼 보이고, 멀리서 보는 사람은 새 내용이 온다고 착각한다.
 * 그때는 가운데 정렬로 세워 둔다.
 */
export const TV_RAIL_STATIC_MAX = 4;

export type TvRailMode = "empty" | "static" | "rotate";

export function tvRailMode(cardCount: number, staticMax = TV_RAIL_STATIC_MAX): TvRailMode {
  if (cardCount <= 0) return "empty";
  return cardCount <= staticMax ? "static" : "rotate";
}

/**
 * 경과 시간으로 인덱스를 구한다. **틱을 세지 않는다.**
 *
 * 배경 탭에서는 브라우저가 `setInterval` 을 늦춘다(최소 1초, 절전 시 1분까지).
 * 틱을 세면 돌아왔을 때 밀린 만큼 한꺼번에 넘어간다. 흐른 시간으로 계산하면
 * 바로 맞는 자리로 간다.
 */
export function indexAtElapsed(elapsedMs: number, intervalMs: number, len: number): number {
  if (len <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  const step = Math.max(1, intervalMs);
  return wrapIndex(Math.floor(elapsedMs / step), len);
}

// ── 쿼리스트링 간격 ──────────────────────────────────────

/** 간격 하한. 너무 짧으면 읽을 수 없고 애니메이션이 끊긴다. */
export const TV_NEWS_SECONDS = { def: 20, min: 5 } as const;
export const TV_CARD_SECONDS = { def: 5, min: 2 } as const;

/**
 * `?news=20&card=5` 를 읽는다. 숫자가 아니거나 하한보다 작으면 **기본값**이다.
 *
 * 하한으로 끌어올리지 않고 기본값으로 되돌리는 이유: `?news=1` 을 넣은 사람은
 * "빠르게" 를 원한 것이지 "5초" 를 원한 것이 아니다. 기본값으로 돌려 두면
 * 의도대로 안 됐다는 것이 눈에 보인다.
 */
export function clampSeconds(
  raw: string | number | null | undefined,
  spec: { def: number; min: number }
): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < spec.min) return spec.def;
  return Math.trunc(n);
}
