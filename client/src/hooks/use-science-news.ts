import { useQuery } from "@tanstack/react-query";
import { newsState, type NewsItem, type NewsState } from "@shared/homeViews";

/**
 * 사이언스타임즈 기사. **뉴스 모드와 TV 가 쓴다.**
 *
 * `Home.tsx` 안에 같은 일을 하는 지역 함수(`useScienceNews`)가 이미 있다. 그걸
 * 고치지 않고 새로 만든 이유는 하나다 — 그 함수에는 **실패 상태가 없다**
 * (`catch` 가 `setLoading(false)` 만 한다). 실패 화면과 "다시 시도" 를 붙이려면
 * `react-query` 로 바꿔야 하는데, 그러면 기존 히어로 뉴스 카드도 같이 달라진다.
 *
 * "기본 모드의 화면과 동작은 지금과 완전히 같아야 한다" 가 이 작업의 전제라서,
 * **코드 15줄 중복을 받아들이고 기본 모드를 무손상으로 두는 쪽**을 골랐다.
 * 기본 모드에서는 뉴스 모드가 렌더되지 않으므로 실제 호출은 한 번뿐이다.
 *
 * 기존 함수를 지우려면 히어로 카드까지 같이 옮겨야 한다. 그건 별건이다.
 */

const PATH = "/api/science-news";

export function useScienceNewsQuery() {
  const query = useQuery<NewsItem[]>({
    queryKey: [PATH],
    queryFn: async () => {
      const res = await fetch(PATH);
      if (!res.ok) throw new Error("기사를 불러오지 못했어요.");
      const data = await res.json();
      // 서버가 배열을 주지만, 예전 응답이 객체 하나였던 적이 있어 둘 다 받는다.
      return Array.isArray(data) ? data : [data];
    },
    // 한 시간 캐시를 서버가 이미 하고 있다. 화면에서 또 자주 묻지 않는다.
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  /**
   * 보여줄 수 있는 상태인가. **뉴스 모드와 TV 가 같은 함수를 쓴다** — 한쪽만
   * 실패 화면을 띄우면 같은 데이터로 두 화면이 다른 말을 한다.
   *
   * 요청이 실패하면 `data` 가 `undefined` 이고 `newsState` 가 `failed` 를 준다.
   * 서버가 `placeholder` 를 보냈을 때도 `failed` 다.
   */
  const state: NewsState = query.isLoading ? "ok" : newsState(query.data);

  return {
    items: query.data ?? [],
    state,
    isLoading: query.isLoading,
    /** 실패 화면의 [다시 시도] 가 부른다. */
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}

/** 실패 화면에서 "직접 보기" 로 보낼 곳. 문구와 주소를 한 곳에 둔다. */
export const SCIENCE_TIMES_URL =
  "https://www.sciencetimes.co.kr/nscvrg/list/menu/265?sersYn=Y";
