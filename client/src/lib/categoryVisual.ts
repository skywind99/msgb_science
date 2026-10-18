import {
  BookOpen,
  FlaskConical,
  Globe,
  Microscope,
  Rocket,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * 게시판별 아이콘과 단색.
 *
 * 표지 이미지도 없고 본문 미리보기도 없는 글에 쓴다. 빈 회색 상자를 두면 "불러오는
 * 중" 처럼 보여서, 교사가 이미지를 넣었는데 안 나온 줄 안다. 게시판 색을 깔면
 * **비어 있는 것이 의도** 라는 게 보인다.
 *
 * **`PostCard.tsx` 에 비슷한 `CATEGORY_META` 가 따로 있다.** 거기는 큰 카드용
 * 그라데이션이고 아이콘 크기가 JSX 에 박혀 있어 작게 쓸 수 없다. 색 선택은 같은
 * 계열로 맞췄다. 둘을 하나로 합치는 것은 `PostCard` 를 건드려야 하는 별건이다 —
 * **게시판 색을 바꿀 때는 두 곳을 같이 봐야 한다.**
 *
 * 2단계에서 새 게시판을 만들 수 있게 되면 이 표에 없는 id 가 생긴다. 그때는
 * `FALLBACK` 이 쓰인다(`docs/TODO.md` 의 2단계 메모 참고).
 */

export type CategoryVisual = {
  Icon: LucideIcon;
  /** Tailwind 배경색. 흰 글자·아이콘과 대비가 나오는 단계(500)를 쓴다. */
  solid: string;
};

const FALLBACK: CategoryVisual = { Icon: Microscope, solid: "bg-primary" };

const MAP: Record<string, CategoryVisual> = {
  home: { Icon: Microscope, solid: "bg-blue-500" },
  lab_intro: { Icon: FlaskConical, solid: "bg-emerald-500" },
  science_class: { Icon: BookOpen, solid: "bg-violet-500" },
  career_program: { Icon: Rocket, solid: "bg-orange-500" },
  student_program: { Icon: Users, solid: "bg-sky-500" },
  local_community: { Icon: Globe, solid: "bg-green-500" },
};

export function categoryVisual(categoryId: string): CategoryVisual {
  return MAP[categoryId] ?? FALLBACK;
}
