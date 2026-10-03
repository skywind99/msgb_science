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
