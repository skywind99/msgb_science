import { Newspaper } from "lucide-react";
import type { NewsItem } from "@shared/homeViews";

/**
 * 위쪽 뉴스 영역. 왼쪽 대표 이미지 960×540, 오른쪽 글.
 *
 * 1920 폭에서 이미지가 정확히 절반이다. 높이 540은 16:9 의 절반이라, 아래 카드
 * 줄과 함께 1080에 맞는다.
 *
 * 글자 크기는 멀리서 읽는 기준이다 — 제목 54px, 요약 30px. **가장 작은 글자도
 * 24px 이상**이라는 규칙을 지킨다(출처·날짜가 26px).
 */

const SOURCE = "사이언스타임즈";

/** 기사가 없을 때. 카드 줄은 계속 돌아야 하므로 이 영역만 대체한다. */
export function TvNewsEmpty() {
  return (
    <div
      className="flex items-center justify-center gap-6 mx-12 rounded-3xl"
      style={{ height: 540, background: "var(--tv-panel)" }}
    >
      <Newspaper className="w-20 h-20" style={{ color: "var(--tv-dim)" }} />
      <p className="text-[40px] font-bold" style={{ color: "var(--tv-dim)" }}>
        과학 뉴스를 준비 중입니다
      </p>
    </div>
  );
}

export function TvNews({
  item,
  index,
  total,
  /** 겹쳐 사라지게 할지. `prefers-reduced-motion` 일 때 CSS 가 바꾼다. */
  slideKey,
}: {
  item: NewsItem;
  index: number;
  total: number;
  slideKey: number;
}) {
  return (
    <div className="flex gap-10 px-12" style={{ height: 540 }}>
      {/* 왼쪽 — 대표 이미지 960×540 */}
      <div
        className="relative shrink-0 rounded-3xl overflow-hidden"
        style={{ width: 960, height: 540, background: "var(--tv-panel)" }}
      >
        {item.imageUrl ? (
          <img
            key={slideKey}
            src={item.imageUrl}
            alt=""
            /* `object-top` — 세로로 긴 사진은 위쪽부터. 카드보드와 같은 이유다. */
            className="tv-slide w-full h-full object-cover object-top"
          />
        ) : (
          /* 관계없는 스톡 사진을 고르지 않는다. 학교 파랑 단색 + 출처 라벨. */
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "var(--tv-accent)" }}
          >
            <Newspaper className="w-28 h-28 text-white/40" />
          </div>
        )}
        <span
          className="absolute top-6 left-6 px-5 py-2 rounded-full text-[26px] font-bold"
          style={{ background: "var(--tv-accent)", color: "#fff" }}
        >
          {SOURCE}
        </span>
      </div>

      {/* 오른쪽 — 글 */}
      {/* `overflow-hidden` 은 방어다. 글자 폭을 계산해 줄 수를 정했지만, 글꼴이
          조금 다르거나 TV 가 배율을 건드리면 한 줄이 더 생길 수 있다. 그때 아래
          카드 줄로 흘러내리지 않게 한다. */}
      <div className="flex flex-col min-w-0 flex-1 py-2 overflow-hidden">
        <p
          className="text-[28px] font-bold tracking-wide mb-5"
          style={{ color: "var(--tv-accent)" }}
        >
          오늘의 과학 뉴스
        </p>

        <h2
          key={slideKey}
          className="tv-slide text-[54px] font-black leading-[1.15] line-clamp-3"
        >
          {item.title}
        </h2>

        {/*
          요약 **4줄.** 2줄이던 것을 늘렸다 — 서버가 200자까지 주는데(약 7.4줄
          분량) 2줄은 1/4 도 못 보여줬다.

          4줄이 한계다. 제목이 최대 3줄까지 늘어나므로, 그때 남는 높이가 219px
          이고 30px·`leading-relaxed` 로 4.5줄이다. 5줄로 하면 549px 가 되어
          영역(524px)을 넘는다. 제목이 짧은 기사에서는 아래가 비지만, 줄이 잘려
          나오는 것보다 낫다.
        */}
        {item.summary && (
          <p
            className="text-[30px] leading-relaxed line-clamp-4 mt-6"
            style={{ color: "var(--tv-dim)" }}
          >
            {item.summary}
          </p>
        )}

        <div className="mt-auto flex items-center gap-6">
          <span className="text-[26px] font-semibold" style={{ color: "var(--tv-dim)" }}>
            {SOURCE}
          </span>
          {item.date && (
            <span className="text-[26px]" style={{ color: "var(--tv-dim)" }}>
              {item.date}
            </span>
          )}

          {/* 기사 순서 점. 몇 번째를 보고 있는지 멀리서도 보이게 크게 둔다. */}
          {total > 1 && (
            <div className="ml-auto flex items-center gap-3">
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === index ? 36 : 12,
                    height: 12,
                    background: i === index ? "var(--tv-accent)" : "var(--tv-line)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
