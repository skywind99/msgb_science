import { ExternalLink, Loader2, Newspaper, RefreshCw } from "lucide-react";
import { splitNews, type NewsItem } from "@shared/homeViews";
import { SCIENCE_TIMES_URL, useScienceNewsQuery } from "@/hooks/use-science-news";

/**
 * 뉴스 모드 — 사이언스타임즈만.
 *
 * **제목·대표 이미지·링크·출처·날짜만 보여준다.** 기사 본문은 가져오지도, 보여주지도
 * 않는다. 남의 기사를 우리 사이트에서 읽게 하면 그건 전재다. 링크는 새 탭으로 열고
 * `rel="noopener noreferrer"` 를 붙인다.
 *
 * 실패 판정은 `newsState()` 가 한다 — TV 도 같은 함수를 쓴다. 서버가 파싱 0건일 때
 * 안내용 1건에 `placeholder` 를 붙이므로, 그때도 실패 화면이 뜬다.
 */

const SOURCE = "사이언스타임즈";

/** 날짜가 빈 문자열로 오는 일이 있다. 빈 줄을 만들지 않는다. */
const DateLine = ({ date }: { date: string }) =>
  date ? <span className="text-muted-foreground">{date}</span> : null;

function Lead({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="relative w-full aspect-[16/9] bg-muted overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Newspaper className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
        <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {SOURCE}
        </span>
      </div>
      <div className="p-5 space-y-2">
        <h2 className="text-[28px] font-black leading-tight text-foreground line-clamp-3 group-hover:text-primary transition-colors">
          {item.title}
        </h2>
        {item.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {item.summary}
          </p>
        )}
        <div className="flex items-center justify-between pt-2 text-xs">
          <DateLine date={item.date} />
          <span className="font-bold text-primary flex items-center gap-1">
            기사 읽기 <ExternalLink className="w-3 h-3" />
          </span>
        </div>
      </div>
    </a>
  );
}

function Row({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
    >
      {/* 112×72. 비율을 고정해 목록이 들쭉날쭉해지지 않게 한다. */}
      <div className="w-28 h-[72px] shrink-0 rounded-lg bg-muted overflow-hidden">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Newspaper className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col">
        <h3 className="text-sm font-bold leading-snug text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h3>
        <div className="mt-auto text-[11px]">
          <DateLine date={item.date} />
        </div>
      </div>
    </a>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-3">
        <div className="w-full aspect-[16/9] rounded-2xl bg-muted animate-pulse" />
        <div className="h-7 w-4/5 rounded bg-muted animate-pulse" />
        <div className="h-4 w-3/5 rounded bg-muted animate-pulse" />
      </div>
      <div className="lg:col-span-2 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 p-3 rounded-xl border border-border">
            <div className="w-28 h-[72px] shrink-0 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-full rounded bg-muted animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Failed({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center bg-card rounded-3xl border border-dashed border-border">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-5">
        <Newspaper className="w-8 h-8 text-muted-foreground/60" />
      </div>
      <h3 className="text-xl font-bold text-foreground mb-1.5">기사를 불러오지 못했어요</h3>
      <p className="text-muted-foreground mb-7">
        사이언스타임즈에서 직접 보실 수 있어요.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          다시 시도
        </button>
        <a
          href={SCIENCE_TIMES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl border-2 border-border text-sm font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        >
          사이언스타임즈에서 직접 보기 <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}

export function NewsBig() {
  const { items, state, isLoading, refetch, isRefetching } = useScienceNewsQuery();
  const { lead, rest } = splitNews(items);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {isLoading ? (
        <Skeleton />
      ) : state !== "ok" || !lead ? (
        <Failed onRetry={() => void refetch()} busy={isRefetching} />
      ) : (
        /* 좁은 화면에서는 위아래로 쌓인다. */
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <Lead item={lead} />
          </div>
          <div className="lg:col-span-2 space-y-2">
            {rest.map((item) => (
              <Row key={item.link} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* 왜 제목만 보여주는지 적어 둔다. 본문을 찾다가 없다고 느끼지 않게. */}
      <p className="text-center text-xs text-muted-foreground">
        제목과 대표 이미지, 링크만 보여 드려요. 기사 전문은 사이언스타임즈에서 볼 수 있어요.
      </p>
    </div>
  );
}
