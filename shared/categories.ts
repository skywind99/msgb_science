/**
 * 게시판 기본값. **이름의 단일 출처다.**
 *
 * DB 의 `categories` 테이블이 실제 값을 들고 있지만, 그 테이블이 없거나 조회가
 * 실패하면 여기 값으로 동작한다(fail open). 메뉴는 사이트의 뼈대라서 **DB 가
 * 흔들릴 때 사라지는 것이 가장 나쁘다.** 글이 안 보이는 것보다 메뉴가 없는 쪽이
 * 더 막막하다 — 어디로 가야 할지조차 모른다.
 *
 * 서버와 화면이 **같은 파일**을 쓴다. 서버는 폴백에, `Navigation` 은 `NAV_ITEMS`
 * 를 만드는 데 쓴다. 두 곳에 적으면 한쪽만 고쳐서 어긋난다.
 *
 * `home` 과 `schedule` 은 **여기 없다.** 게시판이 아니라 기능 페이지고, DB 에도
 * `CHECK (id not in ('home','schedule'))` 로 들어올 수 없게 막아 뒀다.
 */

export type CategoryDefault = {
  /** 글이 가리키는 문자열(`posts.category`). **바뀌지 않는다.** */
  id: string;
  label: string;
  /** 주소. 라우트는 고정이고 이름만 바뀐다. */
  path: string;
  sortOrder: number;
};

/**
 * 순서는 10, 20, 30… 으로 띄운다. 마이그레이션의 시드도 같은 값이고,
 * 2단계에서 중간에 끼울 때 전체를 다시 쓰지 않는다.
 */
export const CATEGORY_DEFAULTS: readonly CategoryDefault[] = [
  { id: "lab_intro", label: "과학실 소개", path: "/lab", sortOrder: 10 },
  { id: "science_class", label: "과학중점반활동", path: "/class", sortOrder: 20 },
  { id: "career_program", label: "창의융합진로프로그램", path: "/career", sortOrder: 30 },
  { id: "student_program", label: "학생중심프로그램", path: "/student", sortOrder: 40 },
  { id: "local_community", label: "지역교육공동체활동", path: "/community", sortOrder: 50 },
] as const;

/** 1단계에서 관리할 수 있는 id. **이 목록에 없는 id 는 받지 않는다.** */
export const CATEGORY_IDS = CATEGORY_DEFAULTS.map((c) => c.id);

/** 게시판이 아닌 id. 숨기거나 이름을 바꿀 수 없다. */
export const RESERVED_CATEGORY_IDS = ["home", "schedule"] as const;

/** id → 주소. 라우트가 고정이라 코드에만 있다(DB 에 없다). */
export const CATEGORY_PATHS: Record<string, string> = {
  home: "/",
  schedule: "/schedule",
  ...Object.fromEntries(CATEGORY_DEFAULTS.map((c) => [c.id, c.path])),
};

/** id → 기본 이름. 폴백과 예약 id 의 표시에 쓴다. */
export const CATEGORY_DEFAULT_LABELS: Record<string, string> = {
  home: "홈",
  schedule: "활동 신청",
  ...Object.fromEntries(CATEGORY_DEFAULTS.map((c) => [c.id, c.label])),
};
