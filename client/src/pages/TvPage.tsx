import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { ApplicationSummary, PublicCategory } from "@shared/schema";
import {
  newsState,
  realNews,
  tvItems,
  wrapIndex,
  type BoardPost,
  type NewsItem,
} from "@shared/homeViews";
import { usePosts } from "@/hooks/use-posts";
import { TvClock } from "@/components/tv/TvClock";
import { TvNews, TvNewsEmpty } from "@/components/tv/TvNews";
import { TvCardRail } from "@/components/tv/TvCardRail";

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
  const [newsIndex] = useState(0);
  const [cardOffset] = useState(0);
  /**
   * 활동 단계(신청 받는 중 → 마감)가 시간으로 바뀐다. 고정된 `new Date()` 를 쓰면
   * 마감된 활동이 계속 "신청 받는 중" 으로 남는다. 다음 커밋의 타이머가 갱신한다.
   */
  const [now] = useState(() => new Date());

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
  const labelOf = (id: string) =>
    (categories.data ?? []).find((c) => c.id === id)?.label ?? id;

  const articles = realNews(news.data);
  const newsOk = !news.isLoading && newsState(news.data) === "ok" && articles.length > 0;
  const current = newsOk ? articles[wrapIndex(newsIndex, articles.length)] : null;

  return (
    <div className="tv-root flex flex-col">
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
      <div className="flex-1 flex flex-col justify-center pb-6">
        <TvCardRail
          posts={cards}
          offset={cardOffset}
          labelOf={labelOf}
          summaryByPost={summaryByPost}
          now={now}
        />
      </div>
    </div>
  );
}
