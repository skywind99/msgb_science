import { LayoutGrid, List, Monitor, Newspaper } from "lucide-react";
import type { ViewMode } from "@shared/homeViews";

/**
 * 메인 화면 보기 전환 툴바.
 *
 * **높이 44 px 고정, margin 없음.** 히어로 바로 위(헤더 아래)에 들어가므로, 기본
 * 모드에서 아래 내용이 밀리는 양이 **정확히 44 px** 이어야 한다. margin 을 주면
 * 그만큼 더 밀리고, 세 모드에서 툴바 위치도 어긋난다.
 *
 * 히어로 위에 둔 이유는 두 가지다.
 *  - 카드보드·뉴스 모드에서 히어로를 숨겨도 **툴바 위치가 움직이지 않는다.**
 *    모드를 연속으로 눌러 볼 때 버튼이 제자리에 있다
 *  - 히어로 아래에 두면 히어로를 숨긴 모드에서 툴바가 화면 맨 위에 붙어 버린다
 *
 * TV 는 모드가 아니라 **별도 라우트(`/tv`)** 다. 그래서 저장하지 않는다.
 */

type Item = {
  mode: ViewMode | "tv";
  label: string;
  icon: React.ReactNode;
};

/**
 * TV 버튼을 보일지. **`/tv` 라우트가 생기는 PR 2 까지 끈다.**
 *
 * 항목을 지우지 않고 플래그로 거르는 이유는, PR 2 에서 되돌릴 일을 한 줄로
 * 줄이려는 것이다. 지웠다가 다시 쓰면 `pending` 처리와 아이콘까지 또 손대야 한다.
 *
 * **PR 2 에서 `/tv` 라우트를 붙이면 `true` 로 바꾸고 `Home.tsx` 의 `pending` 에서
 * `"tv"` 를 빼면 된다.** 그 전까지 `true` 로 두면 "준비 중" 안내만 나온다.
 */
const SHOW_TV_BUTTON = false;

const ALL_ITEMS: Item[] = [
  { mode: "default", label: "기본", icon: <List className="w-4 h-4" /> },
  { mode: "board", label: "카드보드", icon: <LayoutGrid className="w-4 h-4" /> },
  { mode: "news", label: "뉴스", icon: <Newspaper className="w-4 h-4" /> },
  { mode: "tv", label: "TV", icon: <Monitor className="w-4 h-4" /> },
];

/**
 * 실제로 그리는 항목.
 *
 * 세 개로 줄어도 레이아웃은 그대로다 — 툴바가 `flex` + `gap-1` 뿐이고 고정 폭이나
 * `justify-between`, grid 가 없다. 버튼이 왼쪽에 붙어 폭만 좁아진다.
 */
const ITEMS: Item[] = ALL_ITEMS.filter((i) => i.mode !== "tv" || SHOW_TV_BUTTON);

export function ViewSwitcher({
  mode,
  onChange,
  /** 아직 만들지 않은 모드. 누르면 "준비 중" 안내만 한다. */
  pending = [],
  onPending,
}: {
  mode: ViewMode;
  onChange: (next: ViewMode) => void;
  pending?: ReadonlyArray<ViewMode | "tv">;
  onPending?: (label: string) => void;
}) {
  return (
    /* h-11 = 44px. 바깥 여백을 주지 않는다 — 위 설명 참고. */
    <div className="h-11 border-b border-border bg-muted/30">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8">
        {/* 모바일에서도 가로 스크롤이 생기지 않게 줄바꿈을 허용하되,
            항목이 네 개뿐이라 실제로는 한 줄에 들어간다. */}
        <div className="flex h-full items-center gap-1 flex-wrap">
          {ITEMS.map((item) => {
            const isPending = pending.includes(item.mode);
            const active = item.mode === mode;

            return (
              <button
                key={item.mode}
                type="button"
                /* 선택된 항목을 보조기술에 알린다. `aria-pressed` 가 아니라
                   `aria-current` 를 쓰는 이유는 네 항목이 토글이 아니라
                   "지금 어디" 를 가리키기 때문이다. */
                aria-current={active ? "true" : undefined}
                aria-disabled={isPending ? "true" : undefined}
                onClick={() => {
                  if (isPending) {
                    onPending?.(item.label);
                    return;
                  }
                  if (item.mode !== "tv") onChange(item.mode);
                }}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : isPending
                      ? "text-muted-foreground/50"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
