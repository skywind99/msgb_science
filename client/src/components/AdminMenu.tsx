import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutList, Settings, Sparkles, UserPlus } from "lucide-react";
import type { Role } from "@/contexts/admin";

/**
 * 관리 기능 목록. **역할 조건이 여기 한 곳에만 있다.**
 *
 * 전에는 `{(!user || user.role === "admin") && <InviteManager />}` 같은 조건이
 * 버튼마다 흩어져 있었다(초대와 AI 설정 두 곳). 기능이 늘어날 때마다 복사되므로,
 * 하나를 빼먹으면 **그 기능만 교사에게 열리는 구멍**이 생긴다.
 *
 * 상단 버튼이 여섯 개까지 늘어난 것도 함께 정리한다. 아이콘만 여섯 개면 무엇이
 * 무엇인지 알 수 없고, 좁은 화면에서는 메뉴를 밀어낸다.
 *
 * 이 메뉴에 **넣지 않는 것**이 있다.
 *  - 용량 배지 — 상태 표시지 기능이 아니다
 *  - 비밀번호 변경 — 이름 배지에 붙어 있다. "내 계정" 이지 "관리" 가 아니다
 *  - 로그아웃 — 늘 한 번에 닿아야 한다
 */

export type AdminPanel = "popup" | "invite" | "ai" | "category";

type Item = {
  key: AdminPanel;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** 이 역할만 볼 수 있다. 비우면 로그인한 교사 전부. */
  adminOnly: boolean;
};

const ITEMS: Item[] = [
  {
    key: "popup",
    label: "팝업 관리",
    hint: "첫 화면에 띄우는 알림",
    icon: <Settings className="w-4 h-4" />,
    adminOnly: false,
  },
  {
    key: "category",
    label: "게시판 관리",
    hint: "이름·숨김·순서",
    icon: <LayoutList className="w-4 h-4" />,
    adminOnly: true,
  },
  {
    key: "invite",
    label: "교사 계정",
    hint: "초대 링크·비밀번호 재설정",
    icon: <UserPlus className="w-4 h-4" />,
    adminOnly: true,
  },
  {
    key: "ai",
    label: "AI 설정",
    hint: "공급자 키 등록",
    icon: <Sparkles className="w-4 h-4" />,
    adminOnly: true,
  },
];

/**
 * 역할이 볼 수 있는 항목.
 *
 * `role` 이 `undefined` 인 경우는 **로그인했지만 아직 역할을 못 받은 상태**다
 * (`/api/me` 응답 전). 그때는 admin 으로 본다 — 기존 동작과 같다
 * (`{(!user || user.role === "admin") && …}` 가 `!user` 를 통과시켰다).
 * 서버가 `requireAdmin()` 으로 막으므로 화면이 느슨해도 새지 않는다.
 */
export function visibleAdminItems(role: Role | undefined): Item[] {
  const isAdmin = role === undefined || role === "admin";
  return ITEMS.filter((i) => !i.adminOnly || isAdmin);
}

/**
 * 상단의 "관리" 드롭다운.
 *
 * **모달을 직접 들고 있지 않다.** 고른 항목을 올려 보내고, 모달은 `Navigation` 이
 * 그린다. 드롭다운이 닫히면 이 패널은 사라지는데, 모달이 안에 있으면 같이
 * 사라지기 때문이다.
 *
 * 패널은 `position: absolute` 라 **포털이 필요 없다.** `backdrop-filter` 가 바꾸는
 * 것은 자손 `position: fixed` 의 기준이고, `absolute` 는 가장 가까운 배치 조상을
 * 따른다. 모달(`fixed inset-0`)들은 각자 body 포털을 쓴다.
 */
export function AdminMenu({
  role,
  onSelect,
}: {
  role: Role | undefined;
  onSelect: (panel: AdminPanel) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const items = visibleAdminItems(role);

  /**
   * Esc 로 닫고, 밖을 누르면 닫는다.
   *
   * 닫은 뒤 **포커스를 버튼으로 돌려 준다.** 키보드로 열었다가 Esc 를 눌렀을 때
   * 포커스가 문서 처음으로 날아가면, 거기서부터 다시 Tab 해야 한다.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="관리"
        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-full text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors whitespace-nowrap"
      >
        <Settings className="w-4 h-4" />
        <span className="hidden sm:inline">관리</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-50"
        >
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(item.key);
              }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
            >
              <span className="shrink-0 mt-0.5 text-primary">{item.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 모바일 메뉴 안의 같은 목록.
 *
 * 드롭다운을 쓰지 않고 **펼친 채로** 둔다. 모바일 메뉴 자체가 이미 펼쳐진 목록이라,
 * 그 안에서 또 접으면 두 번 눌러야 한다.
 */
export function AdminMenuMobile({
  role,
  onSelect,
}: {
  role: Role | undefined;
  onSelect: (panel: AdminPanel) => void;
}) {
  const items = visibleAdminItems(role);
  if (items.length === 0) return null;

  return (
    <div className="pt-2 mt-2 border-t border-border space-y-1">
      <p className="px-4 pb-1 text-xs font-bold text-muted-foreground">관리</p>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onSelect(item.key)}
          className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl text-base font-semibold text-muted-foreground hover:bg-black/5 transition-colors text-left"
        >
          <span className="shrink-0 text-primary">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
