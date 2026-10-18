/**
 * 게시물을 관리할 권한이 있는지. **한 곳에서만 판단한다.**
 *
 * 같은 규칙을 쓰는 자리가 둘이다 — 게시물 삭제, 명단 한 건 수정·삭제.
 * 예전에는 조건식이 자리마다 따로 적혀 있었다. 그중 하나만 고치면
 * **명단은 막혀 있는데 글은 지워지는** 식으로 어긋난다.
 *
 * **명단 조회는 2026-10-18 에 이 규칙에서 빠졌다.** 아래 `canViewRoster` 를
 * 쓰고, 로그인한 교사면 누구나 본다.
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

/**
 * 신청자 명단을 **볼** 수 있는지. 2026-10-18 에 `canManagePost` 와 갈라졌다.
 *
 * **로그인한 교사면 누구나 본다.** "교사면 신청한 학생 명단이 보이게" 라는
 * 사용자 요청으로 담당자 제한을 풀었다. 개인정보 원칙을 바꾸는 변경이라
 * 되돌릴 수 있게 별도 PR 로 넣었다.
 *
 * 보는 것과 고치는 것을 **일부러 나눴다.** 명단을 확정하거나 지우는 것은
 * 여전히 담당 교사와 `admin` 뿐이다(`canManagePost`). 요청은 "보이게" 였고,
 * 남의 활동 명단을 지울 수 있어야 할 이유는 없다.
 *
 * `authorId` 가 `null` 인 글도 여기서는 통과한다. 담당자를 알 수 없다는 것이
 * 더 이상 거부 이유가 아니다 — 어차피 모든 교사가 보기 때문이다.
 *
 * **대가를 적어 둔다.** 학생 개인정보(이름·학년·반·번호·메모)를 볼 수 있는
 * 사람이 담당자 한 명에서 교사 전체로 늘었고, **누가 어느 명단을 봤는지
 * 기록이 없다.** 조회 기록이 필요해지면 이 함수를 부르는 자리에 남긴다.
 */
export function canViewRoster(user: ManagingUser, _post: PostOwner): boolean {
  return user.role === "admin" || user.role === "teacher";
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
