import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, ExternalLink } from "lucide-react";
import type { Popup } from "@shared/schema";
import { isInternalLink, popupTargetsCurrentPage, toInternalPath } from "@shared/postLink";

const STORAGE_KEY = "popup_dismissed_dates";

function getDismissedDates(): Record<number, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function dismissToday(id: number) {
  try {
    const d = getDismissedDates();
    d[id] = new Date().toDateString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {}
}

function isDismissedToday(id: number): boolean {
  const d = getDismissedDates();
  return d[id] === new Date().toDateString();
}

interface PopupDisplayProps {
  previewPopup?: Popup | null;
  onPreviewClose?: () => void;
}

export function PopupDisplay({ previewPopup, onPreviewClose }: PopupDisplayProps) {
  /**
   * 받아온 팝업 전부(오늘 안 보기만 제외). **걸러내는 일은 그릴 때 한다.**
   *
   * 예전에는 `currentIdx` 로 몇 번째를 보여줄지 셌다. 그런데 경로가 바뀌면
   * 보여줄 목록의 길이가 달라져서(아래 `eligible`), 인덱스가 범위를 벗어나거나
   * 엉뚱한 팝업을 가리킬 수 있다. 그래서 **닫은 것을 id 로 기억**한다.
   */
  const [popups, setPopups] = useState<Popup[]>([]);
  const [closedIds, setClosedIds] = useState<number[]>([]);
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (previewPopup) return; // 미리보기 모드면 일반 팝업 로드 안 함
    fetch("/api/popups")
      .then((r) => r.json())
      .then((data: Popup[]) => {
        setPopups(data.filter((p) => !isDismissedToday(p.id)));
      })
      .catch(() => {});
  }, [previewPopup]);

  // 미리보기 모드
  if (previewPopup) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9998 }}>
        <div className="absolute inset-0 bg-black/50" onClick={onPreviewClose} />
        {/* 미리보기는 **기존 동작 그대로**다. `onLinkClick` 을 주지 않으므로
            링크는 예전처럼 새 탭으로 열리고, 관리 창이 닫히지 않는다. */}
        <PopupCard
          popup={previewPopup}
          onClose={onPreviewClose ?? (() => {})}
          onDismissToday={onPreviewClose ?? (() => {})}
          total={1}
          current={1}
          isPreview
        />
      </div>
    );
  }

  const origin = typeof window === "undefined" ? null : window.location.origin;

  /**
   * 띄울 수 있는 팝업. **지금 보고 있는 페이지를 가리키는 것은 뺀다.**
   *
   * 팝업이 `App` 전체에 마운트돼 있어서, 링크로 간 페이지에서 같은 팝업이 다시
   * 떴다. "자세히 보기" 를 눌러 글에 도착하면 그 글을 가리키는 팝업이 또 뜨는 식이다.
   *
   * `location` 을 의존성에 넣어 **SPA 이동에도 따라온다.** 라우터로 옮기면
   * 새로고침이 없으므로, 받아올 때 한 번 거르는 것으로는 부족하다.
   */
  const eligible = useMemo(
    () => popups.filter((p) => !popupTargetsCurrentPage(p.linkUrl, location, origin)),
    [popups, location, origin]
  );
  const remaining = eligible.filter((p) => !closedIds.includes(p.id));
  const current = remaining[0];

  const closeOne = (id: number) => setClosedIds((prev) => [...prev, id]);

  const handleClose = () => {
    if (current) closeOne(current.id);
  };

  const handleDismissToday = () => {
    if (!current) return;
    dismissToday(current.id);
    closeOne(current.id);
  };

  /**
   * "자세히 보기" 를 눌렀다.
   *
   * **팝업 전체를 닫고 오늘은 다시 띄우지 않는다.** 예전에는 새 탭으로 열려서
   * 원래 탭에 팝업이 그대로 남았고, 새 탭에서도 같은 팝업이 다시 떴다.
   *
   * 사이트 안 링크는 **같은 탭에서 라우터로** 옮긴다 — 새로고침이 없어 빠르고,
   * 뒤로 가기가 자연스럽다. 사이트 밖 링크는 새 탭 그대로 두고(브라우저가 처리),
   * 이쪽 탭의 팝업만 닫는다.
   */
  const handleLinkClick = (popup: Popup) => {
    dismissToday(popup.id);
    // 링크를 눌렀으면 다른 팝업까지 볼 상황이 아니다. 오버레이를 통째로 닫는다.
    setClosedIds(popups.map((p) => p.id));

    // 쿼리·해시까지 살린 경로. 사이트 밖이면 `null` 이고, 그때는 브라우저가
    // 새 탭으로 열도록 두고 아무것도 하지 않는다.
    const path = toInternalPath(popup.linkUrl, origin);
    if (path !== null) navigate(path);
  };

  return (
    <AnimatePresence>
      {current && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9998 }}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleDismissToday}
          />
          <PopupCard
            popup={current}
            onClose={handleClose}
            onDismissToday={handleDismissToday}
            onLinkClick={handleLinkClick}
            total={eligible.length}
            current={eligible.length - remaining.length + 1}
          />
        </div>
      )}
    </AnimatePresence>
  );
}

function PopupCard({
  popup, onClose, onDismissToday, onLinkClick, total, current, isPreview = false,
}: {
  popup: Popup;
  onClose: () => void;
  onDismissToday: () => void;
  /** 없으면 미리보기다 — 링크가 예전처럼 새 탭으로만 열린다. */
  onLinkClick?: (popup: Popup) => void;
  total: number;
  current: number;
  isPreview?: boolean;
}) {
  const origin = typeof window === "undefined" ? null : window.location.origin;
  /** 사이트 안 링크인가. 같은 탭에서 열지, 새 탭으로 열지가 갈린다. */
  const internal = !isPreview && !!onLinkClick && isInternalLink(popup.linkUrl, origin);

  /**
   * 이미지가 있으면 **PC 에서만** 카드를 넓힌다(448px → 672px).
   *
   * 자르지 않고 원본 비율로 보여주면 세로 포스터는 양옆이 남고 가로 사진은
   * 납작해진다. 좁은 카드에서는 어느 쪽도 읽히지 않는다.
   *
   * 모바일은 그대로다 — 화면보다 넓어질 수 없으므로 넓혀 봐야 의미가 없다.
   * 글만 있는 팝업도 그대로다. 글 몇 줄을 672px 로 늘리면 오히려 읽기 나쁘다.
   */
  const hasImage = !!popup.imageUrl;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      /* 세로 배치 + 화면의 90% 상한. 큰 이미지에 긴 글이 붙어도 카드가 화면을
         넘지 않고, **본문만 스크롤돼 버튼 줄이 항상 보인다.** */
      className={`relative bg-white rounded-2xl shadow-2xl overflow-hidden w-full flex flex-col max-h-[90vh] ${
        hasImage ? "max-w-md md:max-w-2xl" : "max-w-md"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 상단 우측: 닫기 + 카운터 */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        {total > 1 && (
          <span className="px-2 py-1 rounded-full bg-black/50 text-white text-xs font-bold">
            {current} / {total}
          </span>
        )}
        {/* 이미지를 자르지 않게 되면서 **버튼이 연한 회색 여백 위에 올 수 있다.**
            흰 아이콘이 묻히지 않도록 배경을 진하게 했다. 자리는 그대로다. */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 미리보기 뱃지 */}
      {isPreview && (
        <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-full bg-blue-500/90 text-white text-xs font-bold">
          미리보기
        </div>
      )}

      {/* 이미지 — **자르지 않는다.**
          예전에는 높이 208px 에 `object-cover` 라 어떤 비율이든 **가운데만 남고
          위아래가 잘렸다.** 세로 포스터는 글자가 통째로 사라졌다.
          이제 원본 비율 그대로 두고 높이만 화면의 60% 로 제한한다. 비율이 남는
          양옆·위아래는 연한 회색으로 채운다. */}
      {popup.imageUrl && (
        /* `shrink-0` 이 있어야 세로 배치에서 이미지가 눌리지 않는다. 눌리면
           `object-contain` 이 비율을 지키느라 좌우가 더 비고 그림만 작아진다. */
        <div className="shrink-0 flex items-center justify-center bg-gray-100">
          <img
            src={popup.imageUrl}
            alt={popup.title}
            className="max-h-[60vh] max-w-full w-auto object-contain"
          />
        </div>
      )}

      {/* 제목·본문 — 길면 **여기만** 스크롤된다.
          `min-h-0` 이 없으면 세로 배치에서 자식이 제 내용 높이만큼 버텨서
          스크롤이 생기지 않고 카드가 화면 밖으로 밀린다. */}
      <div className="min-h-0 overflow-y-auto px-6 pt-6">
        <h2 className="text-xl font-black text-gray-900 mb-2">{popup.title}</h2>
        {popup.content && (
          <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{popup.content}</p>
        )}
      </div>

      {/* 버튼 줄 — **스크롤 밖**이다. 글이 길거나 이미지가 커도
          자세히 보기·오늘 하루 안 보기·닫기가 항상 화면 안에 있어야 한다. */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 pb-6 pt-4">
        {popup.linkUrl ? (
          <a
            href={popup.linkUrl}
            /* 사이트 안이면 같은 탭. 밖이면 새 탭 + `noopener noreferrer` 그대로.
               `href` 는 남겨 둔다 — 가운데 클릭·새 탭으로 열기가 동작해야 하고,
               자바스크립트가 막혀도 링크는 눌러진다. */
            target={internal ? undefined : "_blank"}
            rel={internal ? undefined : "noopener noreferrer"}
            onClick={
              onLinkClick
                ? (e) => {
                    // 사이트 안 링크만 기본 이동을 막고 라우터로 옮긴다.
                    // 수식 키(새 탭으로 열기)를 누른 경우는 브라우저에 맡긴다.
                    if (internal && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                    }
                    onLinkClick(popup);
                  }
                : undefined
            }
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            {popup.linkLabel || "자세히 보기"}
            {internal ? (
              <ArrowRight className="w-3.5 h-3.5" />
            ) : (
              /* 새 탭으로 열린다는 것을 모양으로 알린다. */
              <ExternalLink className="w-3.5 h-3.5" />
            )}
          </a>
        ) : <div />}
        <div className="flex items-center gap-2">
          {!isPreview && (
            <button
              onClick={onDismissToday}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap"
            >
              오늘 하루 안 보기
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </motion.div>
  );
}
