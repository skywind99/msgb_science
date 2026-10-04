import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useAdmin, useAuthHeaders } from "@/contexts/admin";
import {
  CATEGORY_DEFAULTS,
  CATEGORY_DEFAULT_LABELS,
  CATEGORY_PATHS,
} from "@shared/categories";
import type { PublicCategory } from "@shared/schema";

/**
 * 게시판 이름·숨김·순서. **이름을 쓰는 모든 화면이 이 훅 하나를 쓴다.**
 *
 * 예전에는 `NAV_ITEMS`(메뉴), `CATEGORY_LABELS`(글 상세), `Schedule` 의 파생 맵,
 * `App.tsx` 푸터의 하드코딩이 각자 이름을 들고 있었다. 그래서 푸터의
 * "진로프로그램" 이 메뉴의 "창의융합진로프로그램" 과 **이미 달랐다.**
 *
 * **깜빡임 대책**: 로딩 중에는 코드 기본값을 그대로 돌려준다. `undefined` 를
 * 흘리지 않으므로 메뉴가 비는 순간이 없다. 이름이 바뀐 뒤 첫 로딩에서 잠깐 옛
 * 이름이 보이는 것은 남지만, 메뉴가 사라지다 나타나는 것보다 낫다.
 */

/** 로딩 중·실패 시 쓰는 기본값. 서버의 폴백과 같은 파일에서 온다. */
const DEFAULTS: PublicCategory[] = CATEGORY_DEFAULTS.map((c) => ({ id: c.id, label: c.label }));

export type UseCategories = {
  /** 받은 그대로. admin 이면 숨긴 것도 들어 있고 `hidden` 이 붙는다. */
  all: PublicCategory[];
  /**
   * 메뉴·목록에 그릴 것. **admin 에게도 숨긴 게시판은 빠진다.**
   *
   * 흐리게 보이는 안을 쓰지 않은 이유는 하나다 — admin 이 학생과 같은 메뉴를 봐야
   * 숨겼는지 확인할 수 있다. 메뉴에 남아 있으면 치웠다는 사실을 잊는다.
   * 들어가는 길은 게시판 관리 창의 "열기" 와 주소 직접 입력이다.
   */
  visible: PublicCategory[];
  /** id → 이름. 모르는 id 는 그 id 를 그대로 돌려준다(글이 가리키는 값이라도 보여야 한다). */
  labelOf: (id: string) => string;
  /** id → 주소. 라우트는 고정이라 코드에서 온다. */
  routeOf: (id: string) => string;
  /** 그 게시판이 숨겨졌는가. admin 응답에만 값이 있어, 모르면 `false`. */
  isHidden: (id: string) => boolean;
  /** 첫 로딩 중인가. 기본값이 이미 들어 있으므로 화면을 막을 필요는 없다. */
  isLoading: boolean;
};

export function useCategories(): UseCategories {
  const authHeaders = useAuthHeaders();
  const { user } = useAdmin();
  // 역할에 따라 응답이 달라진다. 캐시 키를 나누지 않으면 로그인 전 응답이
  // (`staleTime: Infinity` 때문에) 그대로 쓰여 숨긴 게시판이 관리 화면에서 안 보인다.
  const authKey = user?.id ?? "anon";

  const { data, isLoading } = useQuery<PublicCategory[]>({
    queryKey: [api.categories.list.path, authKey],
    queryFn: async () => {
      const res = await fetch(api.categories.list.path, { headers: authHeaders });
      if (!res.ok) throw new Error("게시판 목록을 불러올 수 없습니다.");
      return res.json();
    },
    // 로딩 중에도 메뉴가 비지 않게 한다.
    placeholderData: DEFAULTS,
    staleTime: Infinity,
  });

  const all = data ?? DEFAULTS;
  const byId = new Map(all.map((c) => [c.id, c]));

  return {
    all,
    visible: all.filter((c) => !c.hidden),
    labelOf: (id) => byId.get(id)?.label ?? CATEGORY_DEFAULT_LABELS[id] ?? id,
    routeOf: (id) => CATEGORY_PATHS[id] ?? "/",
    isHidden: (id) => byId.get(id)?.hidden === true,
    isLoading,
  };
}

/** 저장 후 목록을 다시 받게 한다. 관리 화면이 쓴다. */
export function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [api.categories.list.path] });
}
