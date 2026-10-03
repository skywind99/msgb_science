/**
 * 게시물을 관리할 권한이 있는지. **한 곳에서만 판단한다.**
 *
 * 같은 규칙을 쓰는 자리가 셋이다 — 게시물 삭제, 신청자 명단 조회, 명단 한 건
 * 수정·삭제. 예전에는 조건식이 자리마다 따로 적혀 있었다. 그중 하나만 고치면
 * **명단은 막혀 있는데 글은 지워지는** 식으로 어긋난다.
 *
 * 규칙은 두 줄이다.
 *  - `admin` 은 전부
 *  - `teacher` 는 **자기가 올린 것만**
 *
 * `authorId` 가 `null` 인 글(예전 `x-admin-password` 로 만든 것)은 `admin` 만
 * 다룰 수 있다. 담당자를 알 수 없는 글을 아무 교사에게나 열어주는 것보다 낫다.
 * `user.id` 는 비어 있을 수 없지만 **`null === null` 로 통과하는 일이 없도록
 * 명시적으로 막는다** — 규칙이 코드에 적혀 있어야 다음 사람이 안다.
 */

/** 꼭 필요한 것만 받는다. `Post` 전체를 요구하면 시험하기 어렵다. */
export type PostOwner = { authorId?: string | null };
export type ManagingUser = { id: string; role: "admin" | "teacher" };

export function canManagePost(user: ManagingUser, post: PostOwner): boolean {
  if (user.role === "admin") return true;
  if (!post.authorId) return false;
  return post.authorId === user.id;
}

/** 거부 문구. 라우트와 화면이 같은 것을 쓴다. */
export const DELETE_FORBIDDEN_MESSAGE = "작성자나 관리자만 삭제할 수 있어요.";

export type ManageOutcome =
  | { status: 200 }
  | { status: 401; message: string }
  | { status: 403; message: string }
  | { status: 404; message: string };

/**
 * 삭제 요청의 결과를 정한다. **검사 순서가 여기 들어 있다.**
 *
 * 순서를 순수 함수로 떼어낸 이유는 하나다 — **순서가 곧 정보 유출 여부**라서
 * 시험해야 한다. 없는 글에 403 을 주면 "권한이 없다" 가 곧 "그 글은 있다" 는 뜻이
 * 된다. 라우트 안에 섞여 있으면 토큰 없이는 확인할 수 없다.
 *
 *  1. 비로그인 → 401. 누구인지 모르면 더 볼 것이 없다
 *  2. 없는 글 → 404. **403 보다 먼저다**
 *  3. 권한 없음 → 403
 *
 * (명단 경로는 반대로 권한을 먼저 본다. 거기는 학생 개인정보가 걸려 있어서
 *  게시물이 있는지보다 권한이 앞선다.)
 */
export function manageOutcome(
  user: ManagingUser | null,
  post: PostOwner | null
): ManageOutcome {
  if (!user) return { status: 401, message: "로그인이 필요합니다." };
  if (!post) return { status: 404, message: "Post not found" };
  if (!canManagePost(user, post)) return { status: 403, message: DELETE_FORBIDDEN_MESSAGE };
  return { status: 200 };
}
