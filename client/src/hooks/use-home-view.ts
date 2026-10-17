import { useCallback, useState } from "react";
import {
  DEFAULT_PER_PAGE,
  PER_PAGE_STORAGE_KEY,
  VIEW_STORAGE_KEY,
  parsePerPage,
  parseViewMode,
  type PerPage,
  type ViewMode,
} from "@shared/homeViews";

/**
 * 메인 보기 모드와 카드 개수를 그 브라우저에 기억한다.
 *
 * **저장소가 막혀도 동작해야 한다.** 사생활 보호 창, 쿠키·사이트 데이터 차단,
 * 용량이 꽉 찬 경우에 `localStorage` 가 던진다. 읽기와 쓰기를 모두 `try/catch` 로
 * 감싸고, 읽지 못하면 기본값으로 간다 — 메인 화면이 저장소 때문에 안 열리는 것이
 * 가장 나쁘다.
 *
 * 값 해석은 `shared/homeViews.ts` 의 `parseViewMode`·`parsePerPage` 가 한다.
 * 모르는 값·예전 값이 들어 있어도 기본값으로 떨어진다.
 */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장만 못 하는 것이다. 이번 세션에서는 고른 값이 그대로 쓰인다.
  }
}

export function useHomeView() {
  // 처음 한 번만 읽는다. 다른 탭이 바꿀 수 있지만, 메뉴를 다시 그릴 만한 일이 아니다.
  const [mode, setModeState] = useState<ViewMode>(() => parseViewMode(read(VIEW_STORAGE_KEY)));
  const [perPage, setPerPageState] = useState<PerPage>(() =>
    parsePerPage(read(PER_PAGE_STORAGE_KEY))
  );

  const setMode = useCallback((next: ViewMode) => {
    setModeState(next);
    write(VIEW_STORAGE_KEY, next);
  }, []);

  const setPerPage = useCallback((next: PerPage) => {
    setPerPageState(next);
    write(PER_PAGE_STORAGE_KEY, String(next));
  }, []);

  return { mode, setMode, perPage, setPerPage, defaultPerPage: DEFAULT_PER_PAGE };
}
