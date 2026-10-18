import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileQuestion } from "lucide-react";
import { api } from "@shared/routes";
import type { ApplicationSummary } from "@shared/schema";
import {
  BOARD_FILTERS,
  BOARD_FILTER_LABEL,
  PER_PAGE_OPTIONS,
  applyBoardFilter,
  boardItems,
  cardShapeFor,
  countByFilter,
  pageSlice,
  type BoardFilter,
  type BoardPost,
  type PerPage,
} from "@shared/homeViews";
import { usePosts } from "@/hooks/use-posts";
import { useCategories } from "@/hooks/use-categories";
import { BoardCard } from "@/components/home/BoardCard";
import { GRID_SHAPE, GridIcon } from "@/components/home/GridIcon";

/**
 * 카드보드 — 학교 새소식과 활동을 갤러리로 본다.
 *
 * 대상 선정·필터·페이지 계산은 전부 `shared/homeViews.ts` 의 순수 함수가 한다.
 * 이 파일은 **그 결과를 그리고 상태를 들고 있을 뿐**이다. 그래서 "글이 하나 빠진다"
 * 같은 문제는 브라우저가 아니라 시험에서 걸린다.
 *
 * 글 목록은 `usePosts()`(전체)를 쓴다. `/schedule` 이 이미 같은 방식이고
 * `staleTime: Infinity` 라 세션당 한 번 받는다. 글 1개 평균 963 B 로 재 봤을 때
 * 수백 개까지 문제없다 (`docs/TODO.md` 의 규모 메모 참고).
 */

/** 개수 → 열 수. 좁은 화면에서는 줄이고, **개수는 유지한 채 페이지 안에서 스크롤**한다. */
const COLS: Record<PerPage, string> = {
  4: "grid-cols-1 sm:grid-cols-2",
  6: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  9: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  12: "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4",
};

export function BoardView({
  perPage,
  onPerPageChange,
}: {
  perPage: PerPage;
  onPerPageChange: (next: PerPage) => void;
}) {
  const { data: posts } = usePosts();
  const { all, labelOf } = useCategories();
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [page, setPage] = useState(1);

  /**
   * 1분마다 갱신한다. 활동 단계(신청 받는 중 → 마감)가 시간으로 바뀌므로, 고정된
   * `new Date()` 를 쓰면 마감된 활동이 계속 "신청 받는 중" 으로 보인다.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  /** 숨긴 게시판. admin 응답에만 `hidden` 이 있어, 모르면 빈 목록이다. */
  const hiddenIds = useMemo(
    () => all.filter((c) => c.hidden).map((c) => c.id),
    [all]
  );

  const items = useMemo(
    () => boardItems((posts ?? []) as BoardPost[], hiddenIds),
    [posts, hiddenIds]
  );
  const counts = useMemo(() => countByFilter(items, now), [items, now]);
  const filtered = useMemo(() => applyBoardFilter(items, filter, now), [items, filter, now]);

  // 남은 자리는 활동마다 따로 묻지 않고 한 번에 받는다. 집계라 개인정보가 없다.
  const { data: summaries } = useQuery<ApplicationSummary[]>({
    queryKey: [api.applications.summaries.path],
    staleTime: 60_000,
  });
  const summaryByPost = useMemo(
    () => new Map((summaries ?? []).map((s) => [s.postId, s])),
    [summaries]
  );

  const slice = pageSlice(filtered, perPage, page);
  const shape = cardShapeFor(perPage);

  /**
   * 필터나 개수를 바꾸면 1페이지로.
   *
   * `pageSlice` 가 범위를 넘는 `page` 를 마지막으로 가둬 주지만, 그건 **보여줄 것을
   * 고르는 보정**이고 상태는 그대로 남는다. 상태도 맞춰 두지 않으면 필터를 되돌렸을
   * 때 엉뚱한 페이지로 간다.
   */
  const changeFilter = (next: BoardFilter) => {
    setFilter(next);
    setPage(1);
  };
  const changePerPage = (next: PerPage) => {
    onPerPageChange(next);
    setPage(1);
  };

  /**
   * ←/→ 로 페이지를 넘긴다.
   *
   * **입력 칸에서는 무시한다.** `window` 에 걸면 글쓰기 창에서 제목을 고치는 중에도
   * 페이지가 넘어간다. 모달이 열려 있을 때도 넘기지 않는다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      // 열려 있는 모달(관리 창·글쓰기 창)이 있으면 그쪽 일이다.
      if (document.querySelector("[data-modal-open], [role=dialog]")) return;

      setPage((p) => {
        const next = e.key === "ArrowLeft" ? p - 1 : p + 1;
        return Math.min(slice.pages, Math.max(1, next));
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slice.pages]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* 필터 칩 */}
      <div className="flex flex-wrap items-center gap-2">
        {BOARD_FILTERS.map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => changeFilter(f)}
              className={`inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-bold whitespace-nowrap border-2 transition-colors ${
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {BOARD_FILTER_LABEL[f]}
              <span className={`text-xs font-semibold ${on ? "opacity-80" : "opacity-60"}`}>
                {counts[f]}
              </span>
            </button>
          );
        })}

        {/* 한 화면 개수 — 숫자 대신 배치 모양을 보여준다. 누르기 전에 몇 열인지 보인다. */}
        <div className="ml-auto flex items-center gap-2">
          {/* 좁은 화면에서는 숨긴다. 격자 아이콘만으로도 뜻이 통하고, 칩과 같은
              줄에 있어 자리를 아껴야 한다. */}
          <span className="hidden sm:inline text-xs font-semibold text-muted-foreground">
            한 화면
          </span>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted">
            {PER_PAGE_OPTIONS.map((n) => {
              const shape = GRID_SHAPE[n];
              const on = perPage === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  aria-label={`한 화면에 ${n}개`}
                  title={`한 화면에 ${n}개`}
                  onClick={() => changePerPage(n)}
                  /* 높이 44px 유지. 안쪽 패딩(p-1)까지 더해 컨트롤 전체가 44px 이
                     되도록 버튼은 h-9(36px) 이다 — 바꾸기 전과 같다. */
                  className={`h-9 w-10 rounded-lg flex items-center justify-center transition-colors ${
                    on
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GridIcon cols={shape.cols} rows={shape.rows} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 카드 */}
      {slice.total === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center bg-card rounded-3xl border border-dashed border-border">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-5">
            <FileQuestion className="w-8 h-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-1.5">보여 줄 글이 없어요</h3>
          <p className="text-muted-foreground">
            {filter === "all"
              ? "학교 새소식이나 활동 글이 올라오면 여기에 모입니다."
              : "다른 칩을 눌러 보세요."}
          </p>
        </div>
      ) : (
        <div className={`grid gap-5 ${COLS[perPage]}`}>
          {slice.rows.map((post) => (
            <BoardCard
              key={post.id}
              post={post}
              shape={shape}
              categoryLabel={labelOf(post.category)}
              summary={summaryByPost.get(post.id)}
              now={now}
            />
          ))}
        </div>
      )}

      {/* 페이지 — 글이 없어도 "1 / 1" 로 보여준다. 자리가 사라지면 화면이 흔들린다. */}
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={slice.page <= 1}
          aria-label="이전 페이지"
          className="inline-flex items-center gap-1 h-11 px-4 rounded-xl border-2 border-border text-sm font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-30 disabled:hover:border-border transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          이전
        </button>
        <span className="text-sm font-bold text-foreground tabular-nums">
          {slice.page} / {slice.pages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(slice.pages, p + 1))}
          disabled={slice.page >= slice.pages}
          aria-label="다음 페이지"
          className="inline-flex items-center gap-1 h-11 px-4 rounded-xl border-2 border-border text-sm font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-30 disabled:hover:border-border transition-colors"
        >
          다음
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        ← → 로도 넘길 수 있어요.
      </p>
    </div>
  );
}
