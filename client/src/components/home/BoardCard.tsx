import { Link } from "wouter";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { activityStage, type ActivityStage } from "@shared/activity";
import { coverFallback, type BoardPost, type CardShape } from "@shared/homeViews";
import { categoryVisual } from "@/lib/categoryVisual";

/**
 * 카드보드의 카드. 한 화면 개수에 따라 모양이 셋이다.
 *
 * | 개수 | 모양 | 표지 | 제목 | 보조 정보 |
 * |---|---|---|---|---|
 * | 4 | `info` | 2:1 | 20px 2줄 | 활동: 일시·장소·정원 / 새소식: 요약 3줄 |
 * | 6·9 | `standard` | 16:10 | 16px 2줄 | 상태 + 날짜 + 게시판 |
 * | 12 | `small` | 4:3 | 14px 2줄 | 색 점 + 상태 + 날짜 |
 *
 * **상태 배지는 `activityStage` 가 정한다.** 날짜를 여기서 다시 비교하지 않는다 —
 * 그 함수가 종료·신청 전·마감을 이미 순서대로 가린다.
 */

/** 단계별 색과 글자. `Schedule` 과 같은 말을 쓴다. */
const STAGE: Record<ActivityStage, { label: string; chip: string; dot: string }> = {
  before: { label: "신청 예정", chip: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  open: { label: "신청 받는 중", chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  closed: { label: "신청 마감", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  ended: { label: "종료된 활동", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

const NEWS = { label: "새소식", chip: "bg-blue-100 text-blue-800", dot: "bg-blue-500" };

/**
 * 정보형(4개 보기) 카드의 상태 배지가 표지 왼쪽 위를 덮는 높이.
 *
 * **미리보기 글은 이만큼 내려서 시작한다.** 배지는 `top-3`(12px)에 놓이고 높이가
 * 약 21px 라 33px 까지 차지하는데, 미리보기가 `p-4`(16px)에서 시작해서 **첫 줄이
 * 배지에 덮였다.** 표지 사진이 있는 카드에서는 배지가 사진 위에 얹혀 자연스러운데,
 * 사진이 없어 글이 깔린 카드에서만 문제가 된다.
 *
 * 배지 위치(`top-3`)를 바꿀 때는 이 값도 같이 봐야 한다.
 */
const INFO_BADGE_CLEARANCE = "pt-10";

const ASPECT: Record<CardShape, string> = {
  info: "aspect-[2/1]",
  standard: "aspect-[16/10]",
  small: "aspect-[4/3]",
};

const TITLE: Record<CardShape, string> = {
  info: "text-[20px] leading-snug",
  standard: "text-base leading-snug",
  small: "text-sm leading-snug",
};

/**
 * 표지 자리의 본문 미리보기. **카드 크기에 맞춰 줄 수와 글자 크기를 바꾼다.**
 *
 * 예전에는 어느 크기에서나 `text-xs text-muted-foreground/70` 였다. 너무 작고
 * 연해서 "읽을 것" 이 아니라 "회색 얼룩" 으로 보였다. 표지가 없는 글에서는 이
 * 글자가 **유일한 내용**이므로 읽히게 만든다.
 */
const PREVIEW: Record<CardShape, string> = {
  info: "text-base leading-relaxed line-clamp-5",
  standard: "text-sm leading-relaxed line-clamp-4",
  small: "text-sm leading-snug line-clamp-3",
};

/** 활동이면 단계, 새소식이면 "새소식". */
function badgeOf(post: BoardPost, now: Date) {
  return post.applyEnabled ? STAGE[activityStage(post, now)] : NEWS;
}

const fmt = (v: Date | string | null | undefined, pattern: string) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : format(d, pattern, { locale: ko });
};

/**
 * 표지. 세 가지 중 하나가 된다.
 *
 *  1. 대표 이미지가 있으면 그것
 *  2. 없고 본문 글이 있으면 **그 글을 읽히게** 보여준다
 *  3. 글도 없으면 **게시판 색 단색 + 아이콘 + 게시판 이름**
 *
 * 3번을 빈 회색으로 두면 "불러오는 중" 처럼 보여서, 교사가 이미지를 넣었는데 안
 * 나온 줄 안다. 게시판 색을 깔면 **비어 있는 것이 의도** 라는 게 보인다.
 */
function Cover({
  post,
  shape,
  categoryLabel,
}: {
  post: BoardPost;
  shape: CardShape;
  categoryLabel: string;
}) {
  const text = post.imageUrl ? "" : coverFallback(post);
  const { Icon, solid } = categoryVisual(post.category);

  // 이미지도 글도 없다. 게시판 색 블록.
  if (!post.imageUrl && !text) {
    return (
      <div
        className={`relative w-full ${ASPECT[shape]} overflow-hidden flex flex-col items-center justify-center gap-1.5 ${solid}`}
      >
        <Icon
          className={`text-white/80 ${shape === "small" ? "w-7 h-7" : shape === "info" ? "w-12 h-12" : "w-9 h-9"}`}
        />
        <span
          className={`font-bold text-white/90 px-2 text-center ${
            shape === "small" ? "text-[11px]" : "text-xs"
          }`}
        >
          {categoryLabel}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${ASPECT[shape]} overflow-hidden bg-muted`}>
      {post.imageUrl ? (
        <img
          src={post.imageUrl}
          alt=""
          loading="lazy"
          /*
            `object-top` — 세로로 긴 포스터는 **위쪽부터** 보여준다.
            기본값(`center`)이면 안내문 가운데가 잘려 나와서, 제목이 맨 위에 있는
            포스터가 본문 중간만 보인다. 표지가 2:1 로 납작한 4개 보기에서 가장
            심하다. `object-cover` 는 그대로 둔다 — 비율을 지키며 칸을 채운다.
          */
          className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-500"
        />
      ) : (
        /* 위에서부터 읽히게. 본문색(`text-foreground`)을 쓰고 크기도 올렸다 —
           표지가 없는 글에서는 이 글자가 유일한 내용이다. */
        <p
          className={`absolute inset-0 px-4 pb-4 text-foreground whitespace-pre-wrap ${
            /* 배지는 정보형에만 얹힌다. 나머지 보기는 위 여백이 그대로다. */
            shape === "info" ? INFO_BADGE_CLEARANCE : "pt-4"
          } ${PREVIEW[shape]}`}
        >
          {text}
        </p>
      )}
    </div>
  );
}

export function BoardCard({
  post,
  shape,
  categoryLabel,
  summary,
  now,
}: {
  post: BoardPost;
  shape: CardShape;
  categoryLabel: string;
  /** 정원과 신청 수. 활동 카드에만. 숫자뿐이고 신청자 이름은 쓰지 않는다. */
  summary?: { capacity: number | null; applied: number };
  now: Date;
}) {
  const badge = badgeOf(post, now);
  const date = fmt(post.createdAt, "M월 d일");

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group flex flex-col h-full rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="relative">
        <Cover post={post} shape={shape} categoryLabel={categoryLabel} />
        {/* 정보형은 배지를 표지 왼쪽 위에 얹는다. 나머지는 아래 줄에 둔다.
            표지에 글이 깔린 카드에서 첫 줄을 덮지 않게, 미리보기가
            `INFO_BADGE_CLEARANCE` 만큼 내려서 시작한다. */}
        {shape === "info" && (
          <span
            className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[11px] font-bold ${badge.chip}`}
          >
            {badge.label}
          </span>
        )}
      </div>

      <div className={`flex flex-col flex-1 min-w-0 ${shape === "small" ? "p-3 gap-1" : "p-4 gap-2"}`}>
        {shape === "standard" && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${badge.chip}`}>
              {badge.label}
            </span>
            <span className="text-[11px] text-muted-foreground">{date}</span>
          </div>
        )}

        {shape === "small" && (
          <div className="flex items-center gap-1.5">
            {/* 작은 카드는 배지가 자리를 많이 먹는다. 색 점 + 글자로 줄인다. */}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} />
            <span className="text-[11px] font-semibold text-muted-foreground truncate">
              {badge.label}
            </span>
            <span className="text-[11px] text-muted-foreground/70 shrink-0">{date}</span>
          </div>
        )}

        <h3
          className={`font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors ${TITLE[shape]}`}
        >
          {post.title}
        </h3>

        {/* 정보형만 세 줄을 더 보여준다. 활동이면 일시·장소·정원, 새소식이면 요약. */}
        {shape === "info" && (
          <div className="mt-auto space-y-1 text-xs text-muted-foreground">
            {post.applyEnabled ? (
              <>
                <p className="flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                  {fmt(post.eventStart, "M월 d일(EEE) HH:mm") || "일시 미정"}
                </p>
                <p className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {post.location || "장소 미정"}
                </p>
                <p className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  {summary && summary.capacity != null
                    ? `정원 ${summary.capacity}명 · 현재 ${summary.applied}명 신청`
                    : post.capacity != null
                      ? `정원 ${post.capacity}명`
                      : "제한 없음"}
                </p>
              </>
            ) : (
              /* 표지에 이미 본문이 깔려 있으면 여기서 또 보여주지 않는다.
                 전에는 표지 글자가 작고 연해서 겹쳐도 눈에 안 띄었는데, 읽히게
                 키우고 나니 같은 글이 두 번 나오는 것이 보인다. */
              post.imageUrl ? (
                <p className="line-clamp-3 whitespace-pre-wrap">{coverFallback(post)}</p>
              ) : null
            )}
          </div>
        )}

        {shape === "standard" && (
          <span className="mt-auto text-[11px] font-semibold text-muted-foreground/80">
            {categoryLabel}
          </span>
        )}
      </div>
    </Link>
  );
}
