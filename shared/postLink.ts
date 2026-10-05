/**
 * 팝업의 링크에서 **글 번호를 정확히 뽑는다.**
 *
 * **왜 필요한가.** 게시물을 지우면 그 글을 가리키는 팝업도 같이 지운다. 그 판정이
 * `popup.linkUrl?.includes("/posts/1")` 이었다. `includes` 는 숫자의 끝을 모른다 —
 * **1번 글을 지우면 `/posts/12`, `/posts/123` 을 가리키던 팝업까지 사라졌다.**
 * 교사는 자기가 건드리지 않은 팝업이 없어진 것을 나중에 알게 된다.
 *
 * 그래서 주소에서 번호를 뽑아 **같은 번호일 때만** 지운다.
 */

/**
 * `/posts/12` 에서 `12` 를 뽑는다. 글 주소가 아니면 `null`.
 *
 * 받아들이는 모양 (실제로 팝업에 들어오는 것들이다):
 *  - `/posts/12`              경로만
 *  - `/posts/12/`             뒤에 슬래시
 *  - `/posts/12?from=popup`   쿼리스트링
 *  - `/posts/12#apply`        조각
 *  - `https://…/posts/12`     전체 주소
 *
 * 받아들이지 않는 모양:
 *  - `/posts/12abc`, `/posts/`, `/posts`  — 번호로 끝나지 않는다
 *  - `/archive/posts/12`                  — 다른 경로 아래
 */
export function postIdFromLink(linkUrl: string | null | undefined): number | null {
  if (!linkUrl) return null;

  // 쿼리와 조각을 먼저 떼어낸다. `?` 나 `#` 이 번호에 붙어 오는 일이 흔하다.
  const path = linkUrl.split(/[?#]/)[0];

  // 경로가 정확히 `/posts/<숫자>` 로 끝나야 한다. 뒤 슬래시 하나는 허용한다.
  // `(?:^|\/)` 가 아니라 `(?<![^/])` 를 쓰고 싶지만, 뒤돌아보기는 구형 Safari 에서
  // 막힌다. 호스트가 앞에 붙는 경우까지 덮으려고 `\/posts\/` 로 고정했다.
  const m = /\/posts\/(\d+)\/?$/.exec(path);
  if (!m) return null;

  const id = Number(m[1]);
  // 앞에 0 이 붙은 "012" 같은 것은 같은 글로 보지 않는다. 주소를 만든 쪽이
  // 우리가 아니라는 뜻이고, 숫자로 바꾸면 다른 글을 지울 수 있다.
  if (String(id) !== m[1]) return null;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 이 팝업이 그 글을 가리키는가. 지우기 판정은 이 한 줄로만 한다. */
export function popupPointsToPost(linkUrl: string | null | undefined, postId: number): boolean {
  return postIdFromLink(linkUrl) === postId;
}

/**
 * "팝업으로 등록" 을 눌렀을 때 무엇을 할지.
 *
 * **같은 글의 팝업을 두 번 만들지 않는다.** 전에는 누를 때마다 새로 만들어서,
 * 알림을 못 본 교사가 다시 누르면 같은 팝업이 두 개 뜨고 방문자는 같은 안내를
 * 두 번 닫아야 했다.
 *
 * 꺼진 팝업과 켜진 팝업을 **구분해서 알린다.** "이미 있다" 만 말하면, 교사는
 * 등록했는데 왜 안 뜨는지 알 수 없다 — 꺼져 있다는 사실을 알아야 켤 수 있다.
 *
 * 번호 비교는 `popupPointsToPost` 를 쓴다. `includes` 로 비교하면 `/posts/1` 이
 * `/posts/12` 와 섞인다.
 */
export type PopupRegisterPlan =
  | { action: "create" }
  | { action: "exists"; popupId: number }
  | { action: "disabled"; popupId: number };

export function planPopupRegister(
  popups: ReadonlyArray<{ id: number; linkUrl: string | null; active: boolean }>,
  postId: number
): PopupRegisterPlan {
  const mine = popups.filter((p) => popupPointsToPost(p.linkUrl, postId));
  if (mine.length === 0) return { action: "create" };

  // 켜진 것이 하나라도 있으면 그걸 알린다. 꺼진 것만 있을 때 "켜세요" 가 맞다.
  const on = mine.find((p) => p.active);
  if (on) return { action: "exists", popupId: on.id };
  return { action: "disabled", popupId: mine[0].id };
}

/**
 * 팝업이 가리킬 주소. **상대 경로로 만든다.**
 *
 * 예전에는 `window.location.origin` 을 붙였다. 그래서 **Preview 에서 등록하면
 * Preview 주소가 박혔다** — 팝업은 운영 DB 에 저장되므로, 운영 사이트 방문자가
 * 그 팝업을 눌러 Preview 로 넘어간다. 실제로 그렇게 만들어진 팝업이 하나 있었다.
 *
 * 상대 경로면 어느 배포에서 만들어도 그 사이트 안에서 열린다.
 * `insertPopupSchema` 가 `^(https?:\/\/|\/)` 를 받으므로 `/posts/12` 는 통과한다.
 */
export const postPopupLink = (postId: number) => `/posts/${postId}`;

// ── 팝업 링크를 누를 때 / 지금 보는 페이지인지 ──────────────
//
// 팝업은 `App` 전체에 마운트돼 있다. 그래서 링크로 간 페이지에서도 같은 팝업이
// 다시 뜬다. 아래 함수들이 그 판정을 맡는다. 화면이 아니라 여기 두는 이유는
// **브라우저 없이 시험해야** 하기 때문이다 — 틀리면 팝업이 안 뜨거나 안 닫힌다.

/**
 * **라우터에 넘길** 사이트 안 경로. 쿼리와 해시를 살린다.
 *
 * 사이트 안 주소가 아니면 `null` 이다 — 그때는 같은 탭에서 옮기면 안 된다.
 * 상대 경로(`/posts/12?x=1`)와 **우리 origin 과 같은** 전체 주소만 받는다.
 */
export function toInternalPath(
  raw: string | null | undefined,
  origin?: string | null
): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith("/")) return value;

  // 전체 주소. 우리 origin 과 같을 때만 경로를 쓴다.
  if (!origin) return null;
  try {
    const url = new URL(value);
    const here = new URL(origin);
    if (url.origin !== here.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/**
 * 비교할 수 있는 경로만 남긴다. 쿼리·해시·호스트·뒤 슬래시를 떼어낸다.
 *
 * 사이트 안 주소가 아니면 `null` 이다. `null` 은 "비교할 수 없다" 는 뜻이고,
 * 비교하는 쪽은 그때 **같지 않다**고 본다 — 모르면 팝업을 띄우는 쪽이 안전하다.
 */
export function toComparablePath(
  raw: string | null | undefined,
  origin?: string | null
): string | null {
  const full = toInternalPath(raw, origin);
  if (full === null) return null;

  let path = full.split(/[?#]/)[0];
  // 뒤 슬래시 하나는 같은 경로로 본다. 루트(`/`)는 남긴다.
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

/**
 * 사이트 안 링크인가. 같은 탭에서 열지, 새 탭으로 열지를 정한다.
 *
 * 상대 경로(`/posts/12`)와 **우리 origin 과 같은** 전체 주소만 "안" 이다.
 * 예전에 Preview 주소로 만들어진 팝업은 운영에서 보면 **밖**이 된다 — 그게 맞다.
 * 다른 사이트이고, 같은 탭에서 열면 교사가 사이트를 떠난 줄 모른다.
 */
export function isInternalLink(
  raw: string | null | undefined,
  origin?: string | null
): boolean {
  return toComparablePath(raw, origin) !== null;
}

/**
 * 이 팝업이 **지금 보고 있는 페이지**를 가리키는가. 그러면 띄우지 않는다.
 *
 * 글 페이지에서는 **번호로 비교한다** — 경로 문자열만 보면 `/posts/1` 과
 * `/posts/12` 를 섞을 위험이 남고, `postIdFromLink` 가 그걸 이미 정확히 다룬다.
 * 글 페이지가 아니면 경로를 그대로 비교한다(`/lab` 등).
 *
 * **사이트 밖 링크는 늘 `false`** 다. 먼저 걸러야 한다 — 그러지 않으면
 * `https://다른사이트/posts/79` 가 우리 `/posts/79` 와 같은 글로 잡힌다.
 */
export function popupTargetsCurrentPage(
  linkUrl: string | null | undefined,
  currentPath: string,
  origin?: string | null
): boolean {
  if (!isInternalLink(linkUrl, origin)) return false;

  const currentId = postIdFromLink(currentPath);
  if (currentId !== null) return popupPointsToPost(linkUrl, currentId);

  const link = toComparablePath(linkUrl, origin);
  const here = toComparablePath(currentPath, origin);
  return link !== null && here !== null && link === here;
}
