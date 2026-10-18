import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { activityStage, type ActivityStage } from "@shared/activity";
import { coverFallback, tvRailMode, wrapIndex, type BoardPost } from "@shared/homeViews";
import { categoryVisual } from "@/lib/categoryVisual";
import type { ApplicationSummary } from "@shared/schema";

/**
 * 아래쪽 카드 줄.
 *
 * 카드 폭 400px 고정. 1920 폭에서 네 장 반이 보이므로 **오른쪽 끝 카드가 일부
 * 잘려** 옆으로 더 있다는 것이 보인다. 그래야 멀리서도 넘어간다는 걸 안다.
 *
 * **카드가 4장 이하면 돌리지 않고 가운데 정렬로 세워 둔다**(`tvRailMode`).
 * 네 장을 5초마다 밀면 같은 카드가 계속 지나가는 것처럼 보여서, 멀리서 보는 사람이
 * 새 내용이 온다고 착각한다.
 */

const CARD_W = 400;
const GAP = 24;

/** 단계별 색과 말. 카드보드·`/schedule` 과 같은 말을 쓴다. */
const STAGE: Record<ActivityStage, { label: string; bg: string; fg: string }> = {
  open: { label: "신청 받는 중", bg: "#059669", fg: "#ecfdf5" },
  before: { label: "신청 예정", bg: "#b45309", fg: "#fffbeb" },
  // TV 에는 마감·종료가 오지 않는다(`tvItems` 가 걸러낸다). 그래도 색을 둔다 —
  // 넘어오면 회색으로 보이는 쪽이 빈칸보다 낫다.
  closed: { label: "신청 마감", bg: "#334155", fg: "#e2e8f0" },
  ended: { label: "종료", bg: "#334155", fg: "#e2e8f0" },
};

const NEWS_BADGE = { label: "새소식", bg: "#1d4ed8", fg: "#eff6ff" };

const fmt = (v: Date | string | null | undefined, pattern: string) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : format(d, pattern, { locale: ko });
};

export function TvCard({
  post,
  categoryLabel,
  summary,
  now,
  /** 신청 받는 중인 활동에만 붙는다. 다음 커밋에서 QR 로 채운다. */
  corner,
}: {
  post: BoardPost;
  categoryLabel: string;
  summary?: ApplicationSummary;
  now: Date;
  corner?: React.ReactNode;
}) {
  const stage = post.applyEnabled ? activityStage(post, now) : null;
  const badge = stage ? STAGE[stage] : NEWS_BADGE;
  const { Icon, solid } = categoryVisual(post.category);
  const preview = post.imageUrl ? "" : coverFallback(post);

  return (
    <div
      className="shrink-0 rounded-3xl overflow-hidden flex flex-col h-full"
      style={{ width: CARD_W, background: "var(--tv-panel)" }}
    >
      {/*
        표지 높이를 **비율로** 잡는다(55%). 고정 px 로 두면 남는 공간보다 카드가
        커져서 아래가 잘린다 — 실제로 80px 이 잘리고 있었다. 비율이면 카드가 늘
        주어진 높이를 정확히 채우므로, 위쪽 뉴스 영역을 조금 바꿔도 다시 계산할
        일이 없다.
      */}
      <div className="relative w-full shrink-0" style={{ height: "55%" }}>
        {post.imageUrl ? (
          <img src={post.imageUrl} alt="" className="w-full h-full object-cover object-top" />
        ) : preview ? (
          /* 위쪽 여백을 배지 높이만큼 비운다. `p-6` 만 주면 "새소식" 배지가
             첫 줄을 덮어서 글이 반쯤 가려진다. 배지는 `top-5`(20px) + 높이
             약 41px = 61px 를 차지한다. */
          <p
            className="absolute inset-0 px-6 pb-6 pt-[76px] text-[26px] leading-snug line-clamp-3"
            style={{ color: "var(--tv-text)" }}
          >
            {preview}
          </p>
        ) : (
          /* 이미지도 글도 없으면 게시판 색. 빈칸을 두면 "불러오는 중" 처럼 보인다. */
          <div className={`w-full h-full flex flex-col items-center justify-center gap-2 ${solid}`}>
            <Icon className="w-16 h-16 text-white/80" />
            <span className="text-[24px] font-bold text-white/90">{categoryLabel}</span>
          </div>
        )}

        <span
          className="absolute top-5 left-5 px-4 py-1.5 rounded-full text-[24px] font-bold"
          style={{ background: badge.bg, color: badge.fg }}
        >
          {badge.label}
        </span>

        {corner}
      </div>

      {/* 글. `min-h-0` 이 없으면 flex 자식이 내용 높이만큼 버텨서 넘친다. */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden p-5 gap-1.5">
        <span className="text-[24px] font-semibold" style={{ color: "var(--tv-dim)" }}>
          {post.applyEnabled
            ? fmt(post.eventStart, "M월 d일(EEE) HH:mm") || "일시 미정"
            : fmt(post.createdAt, "M월 d일")}
        </span>

        <h3 className="text-[28px] font-bold leading-snug line-clamp-2">{post.title}</h3>

        {/* 신청 수는 **숫자만**. 신청자 이름은 어디에도 쓰지 않는다. */}
        {post.applyEnabled && summary && (
          <span className="mt-auto text-[24px]" style={{ color: "var(--tv-dim)" }}>
            {summary.capacity != null
              ? `정원 ${summary.capacity}명 · 현재 ${summary.applied}명 신청`
              : `현재 ${summary.applied}명 신청`}
          </span>
        )}
      </div>
    </div>
  );
}

export function TvCardRail({
  posts,
  offset,
  labelOf,
  summaryByPost,
  now,
  renderCorner,
}: {
  posts: readonly BoardPost[];
  /** 지금 맨 앞에 올 카드의 번호. 밖에서 경과 시간으로 계산해 넘긴다. */
  offset: number;
  labelOf: (id: string) => string;
  summaryByPost: Map<number, ApplicationSummary>;
  now: Date;
  renderCorner?: (post: BoardPost, stage: ActivityStage | null) => React.ReactNode;
}) {
  const mode = tvRailMode(posts.length);
  if (mode === "empty") return null;

  /**
   * 돌릴 때는 **목록을 두 번 이어 붙여** 끝에서 처음으로 넘어가는 자리가 비지
   * 않게 한다. 한 벌만 두면 마지막 장 다음에 빈 공간이 지나간다.
   */
  const ordered =
    mode === "static"
      ? posts.slice()
      : Array.from({ length: posts.length * 2 }, (_, i) => posts[wrapIndex(i, posts.length)]);

  const shift = mode === "static" ? 0 : wrapIndex(offset, posts.length) * (CARD_W + GAP);

  return (
    /* 높이를 **주어진 만큼** 쓴다. 카드가 그 안을 채우므로 넘치지 않는다. */
    <div className="px-12 h-full min-h-0 flex flex-col">
      <p className="text-[28px] font-bold mb-3 shrink-0" style={{ color: "var(--tv-dim)" }}>
        학교 새소식과 신청 받는 활동
      </p>
      <div
        /* `justify-center` — 네 장 이하일 때 가운데로 모은다. */
        className={`flex-1 min-h-0 overflow-hidden flex ${mode === "static" ? "justify-center" : ""}`}
        style={{ gap: GAP }}
      >
        <div
          className="tv-slide flex h-full"
          style={{
            gap: GAP,
            transform: `translateX(-${shift}px)`,
            transition: "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {ordered.map((post, i) => {
            const stage = post.applyEnabled ? activityStage(post, now) : null;
            return (
              <TvCard
                // 두 벌을 이어 붙였으므로 번호를 섞어 키를 만든다.
                key={`${post.id}-${i}`}
                post={post}
                categoryLabel={labelOf(post.category)}
                summary={summaryByPost.get(post.id)}
                now={now}
                corner={renderCorner?.(post, stage)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
