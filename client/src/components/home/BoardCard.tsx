import { Link } from "wouter";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { activityStage, type ActivityStage } from "@shared/activity";
import { coverFallback, type BoardPost, type CardShape } from "@shared/homeViews";

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
 * 표지. 대표 이미지가 없으면 본문 앞부분을 연한 회색 배경에 보여준다.
 *
 * 빈 상자를 두지 않는 이유는 카드 높이가 들쭉날쭉해지기 때문이다. 글귀도 없으면
 * 회색 배경만 남는다.
 */
function Cover({ post, shape }: { post: BoardPost; shape: CardShape }) {
  const text = post.imageUrl ? "" : coverFallback(post);

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
        <p
          className={`absolute inset-0 p-3 text-muted-foreground/70 whitespace-pre-wrap ${
            shape === "small" ? "text-[11px] line-clamp-3" : "text-xs line-clamp-4"
          }`}
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
        <Cover post={post} shape={shape} />
        {/* 정보형은 배지를 표지 왼쪽 위에 얹는다. 나머지는 아래 줄에 둔다. */}
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
              <p className="line-clamp-3 whitespace-pre-wrap">{coverFallback(post)}</p>
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
