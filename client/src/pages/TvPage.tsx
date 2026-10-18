import { Suspense, lazy, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { WifiOff } from "lucide-react";
import { api } from "@shared/routes";
import type { ApplicationSummary, PublicCategory } from "@shared/schema";
import { CATEGORY_DEFAULT_LABELS } from "@shared/categories";
import { tvQrUrl } from "@shared/homeViews";
import {
  TV_CARD_SECONDS,
  TV_NEWS_SECONDS,
  clampSeconds,
  newsState,
  realNews,
  tvItems,
  wrapIndex,
  type BoardPost,
  type NewsItem,
} from "@shared/homeViews";
import { useIdleCursor, useMinuteNow, useTvRotation } from "@/hooks/use-tv-rotation";
import { useTvScale } from "@/hooks/use-tv-scale";
import { usePosts } from "@/hooks/use-posts";
import { TvClock } from "@/components/tv/TvClock";
import { TvNews, TvNewsEmpty } from "@/components/tv/TvNews";
import { TvCardRail } from "@/components/tv/TvCardRail";

/**
 * QR 은 **한 번 더 지연 로딩**한다. `TvPage` 자체가 이미 별도 청크지만, QR 은
 * 신청 받는 중인 활동이 있을 때만 필요하다 — 그런 활동이 없는 날에는 내려받지
 * 않는다.
 */
const TvQr = lazy(() => import("@/components/tv/TvQr"));

/**
 * TV 화면 (`/tv`).
 *
 * 대형 TV(1920×1080)에 걸어 두고 멀리서 보는 화면이다. 사람이 조작하지 않아도
 * 스스로 돌아야 하고, 헤더·푸터·팝업·알림·관리자 메뉴가 없다 (`App.tsx` 의
 * `Shell` 이 `/tv` 를 먼저 가른다).
 *
 * 표시 대상과 순환 인덱스는 **`shared/homeViews.ts` 의 순수 함수**가 정한다.
 * 여기서 새 판정을 만들지 않는다 — 그 함수들은 이미 시험을 통과했다.
 *
 * **데이터 쿼리에 `staleTime`·`refetchInterval` 을 직접 지정한다.** 전역 기본값이
 * `staleTime: Infinity` 라서, 안 덮으면 TV 가 하루 종일 첫 화면을 보여준다.
 */

/** 뉴스 데이터. 5분마다 다시 받는다. */
const TV_QUERY = {
  staleTime: 0,
  refetchInterval: 5 * 60 * 1000,
  // TV 는 포커스가 오고 가는 화면이 아니다. 포커스로 다시 받을 이유가 없다.
  refetchOnWindowFocus: false,
  // 실패해도 마지막 데이터를 유지한다(react-query 기본 동작).
  retry: 1,
} as const;

export default function TvPage() {
  const [, navigate] = useLocation();

  /**
   * 간격은 쿼리스트링으로 바꿀 수 있다 — `/tv?news=30&card=8`.
   *
   * `clampSeconds` 가 하한 미달·숫자 아님을 **기본값으로 되돌린다.** 하한으로
   * 끌어올리지 않는 이유는, `?news=1` 을 넣은 사람은 "빠르게" 를 원한 것이라
   * 5초로 올려 두면 의도대로 됐다고 착각하기 때문이다.
   */
  const params = new URLSearchParams(window.location.search);
  const newsSec = clampSeconds(params.get("news"), TV_NEWS_SECONDS);
  const cardSec = clampSeconds(params.get("card"), TV_CARD_SECONDS);

  /** 활동 단계 판정에 쓰는 지금. 카드 목록보다 **먼저** 있어야 한다. */
  const now = useMinuteNow();

  const news = useQuery<NewsItem[]>({
    queryKey: ["/api/science-news", "tv"],
    queryFn: async () => {
      const res = await fetch("/api/science-news");
      if (!res.ok) throw new Error("뉴스를 불러오지 못했습니다.");
      const data = await res.json();
      return Array.isArray(data) ? data : [data];
    },
    ...TV_QUERY,
  });

  /**
   * 게시판 목록. **숨긴 게시판을 걸러내는 데만** 쓴다.
   *
   * TV 는 로그인하지 않은 화면이라 `hidden` 이 응답에 오지 않는다. 그래서 "목록에
   * 없는 게시판" 을 숨긴 것으로 본다 — 서버가 비로그인에게 숨긴 게시판을 아예
   * 내려보내지 않기 때문에 결과가 같다.
   */
  const categories = useQuery<PublicCategory[]>({
    queryKey: [api.categories.list.path, "tv"],
    queryFn: async () => {
      const res = await fetch(api.categories.list.path);
      if (!res.ok) throw new Error("게시판 목록을 불러오지 못했습니다.");
      return res.json();
    },
    ...TV_QUERY,
  });

  const { data: posts } = usePosts();

  const summaries = useQuery<ApplicationSummary[]>({
    queryKey: [api.applications.summaries.path, "tv"],
    queryFn: async () => {
      const res = await fetch(api.applications.summaries.path);
      if (!res.ok) throw new Error("신청 현황을 불러오지 못했습니다.");
      return res.json();
    },
    ...TV_QUERY,
  });

  const visibleIds = useMemo(
    () => new Set((categories.data ?? []).map((c) => c.id)),
    [categories.data]
  );

  /**
   * 카드에 올릴 글. **`tvItems` 가 정한다** — 새소식 10건 + 신청 받는 중·예정
   * 활동, 마감·종료 제외, 겹치면 활동 우선. 새 판정을 만들지 않는다.
   *
   * 숨긴 게시판 id 를 넘겨야 하는데 TV 는 `hidden` 을 모른다. 대신 **목록에 없는
   * 게시판**을 숨긴 것으로 본다.
   */
  const cards = useMemo(() => {
    const all = (posts ?? []) as BoardPost[];
    if (visibleIds.size === 0) return tvItems(all, [], now);
    const hidden = Array.from(new Set(all.map((p) => p.category))).filter(
      (id) => id !== "home" && !visibleIds.has(id)
    );
    return tvItems(all, hidden, now);
  }, [posts, visibleIds, now]);

  const summaryByPost = useMemo(
    () => new Map((summaries.data ?? []).map((s) => [s.postId, s])),
    [summaries.data]
  );
  /**
   * 게시판 이름. **`home` 은 게시판 목록에 없다** — 예약 id 라 `categories` 테이블에
   * 들어가지 않는다(`CHECK (id not in ('home','schedule'))`). 그래서 응답에서
   * 못 찾고 raw id 인 `"home"` 이 화면에 그대로 나왔다.
   *
   * 코드 기본값으로 떨어뜨린다. 교사가 이름을 바꾼 게시판은 서버 값이 이긴다.
   */
  const labelOf = (id: string) =>
    (categories.data ?? []).find((c) => c.id === id)?.label ??
    CATEGORY_DEFAULT_LABELS[id] ??
    id;

  const articles = realNews(news.data);
  const newsOk = !news.isLoading && newsState(news.data) === "ok" && articles.length > 0;

  /** 모든 타이머가 이 훅 하나에 있다. 언마운트할 때 함께 정리된다. */
  const { newsIndex, cardOffset, paused, progress, pause, stepNews } = useTvRotation({
    newsCount: articles.length,
    cardCount: cards.length,
    newsSec,
    cardSec,
  });

  const idle = useIdleCursor();
  /** 1920×1080 무대를 지금 화면에 맞춘다. 2560×1440 이면 1.333배가 된다. */
  const scale = useTvScale();

  /**
   * PC 를 연결했을 때의 조작. ←/→ 기사, 스페이스 일시정지, F 전체화면,
   * Esc 로 메인으로 나가기.
   *
   * 입력 칸을 가릴 걱정은 없다 — TV 화면에는 입력 칸이 없다. 그래도 수식 키가
   * 눌린 경우는 브라우저에 맡긴다(Ctrl+F 등).
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepNews(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepNews(-1);
      } else if (e.key === " ") {
        e.preventDefault();
        pause();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void document.documentElement.requestFullscreen().catch(() => {});
      } else if (e.key === "Escape") {
        // 전체 화면이면 브라우저가 Esc 를 먼저 먹는다. 그 다음 Esc 에 나간다.
        if (!document.fullscreenElement) navigate("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, stepNews, navigate]);

  /**
   * 연속 실패. 세 쿼리 중 **가장 많이 실패한 것**을 본다.
   *
   * react-query 가 마지막 성공 데이터를 들고 있으므로 화면은 계속 돈다. 다만
   * 보이는 내용이 낡았을 수 있다는 것을 작게 알린다.
   */
  const failures = Math.max(news.failureCount, categories.failureCount, summaries.failureCount);

  const current = newsOk ? articles[wrapIndex(newsIndex, articles.length)] : null;

  return (
    <div className={`tv-root ${idle ? "tv-idle" : ""}`}>
      <div className="tv-stage" style={{ transform: `scale(${scale})` }}>
      <TvClock />

      {current ? (
        <TvNews
          item={current}
          index={wrapIndex(newsIndex, articles.length)}
          total={articles.length}
          slideKey={newsIndex}
        />
      ) : (
        <TvNewsEmpty />
      )}

      {/* 카드 줄. 0장이면 아무것도 그리지 않고 뉴스가 자리를 다 쓴다. */}
      {/* 뉴스와 "학교 새소식…" 이 붙어 있어서 위쪽 여백을 줬다. */}
      <div className="flex-1 min-h-0 flex flex-col pt-5 pb-3">
        <TvCardRail
          posts={cards}
          offset={cardOffset}
          labelOf={labelOf}
          summaryByPost={summaryByPost}
          now={now}
          /* **신청 받는 중인 활동에만** QR 을 붙인다. 신청 예정 활동에 붙이면
             찍어 간 학생이 "아직 신청 기간이 아닙니다" 를 보게 된다. */
          renderCorner={(post, stage) => {
            if (stage !== "open") return null;
            const url = tvQrUrl(window.location.origin, post.id);
            if (!url) return null;
            return (
              <div className="absolute bottom-4 right-4">
                <Suspense fallback={null}>
                  <TvQr url={url} />
                </Suspense>
              </div>
            );
          }}
        />
      </div>

      {/* 맨 아래 진행 줄 — 다음 기사까지. 일시정지하면 멈춘 자리에 머문다. */}
      <div className="h-2 shrink-0" style={{ background: "var(--tv-line)" }}>
        <div
          className="h-full"
          style={{
            width: `${Math.round(progress * 100)}%`,
            background: "var(--tv-accent)",
            transition: paused ? "none" : "width 1s linear",
          }}
        />
      </div>

      {/* 일시정지 표시. 눌러 놓고 잊었을 때 왜 안 넘어가는지 알 수 있게. */}
      {paused && (
        <div
          className="absolute top-8 right-12 px-5 py-2 rounded-full text-[26px] font-bold"
          style={{ background: "var(--tv-line)", color: "var(--tv-text)" }}
        >
          일시정지
        </div>
      )}

      {/* 연속 3회 실패. 화면은 마지막 데이터로 계속 돈다. */}
      {failures >= 3 && (
        <div
          className="absolute bottom-6 left-12 flex items-center gap-3 px-5 py-2 rounded-full"
          style={{ background: "var(--tv-panel)", color: "var(--tv-dim)" }}
        >
          <WifiOff className="w-6 h-6" />
          <span className="text-[24px] font-semibold">연결 확인 중</span>
        </div>
      )}
      </div>
    </div>
  );
}
