import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { newsState, realNews, wrapIndex, type NewsItem } from "@shared/homeViews";
import { TvClock } from "@/components/tv/TvClock";
import { TvNews, TvNewsEmpty } from "@/components/tv/TvNews";

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
  const [newsIndex, setNewsIndex] = useState(0);

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

      {/* 카드 줄과 진행 줄은 다음 커밋에서 채운다. */}
      <div className="flex-1" />
    </div>
  );
}
