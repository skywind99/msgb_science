import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink } from "lucide-react";
import type { Popup } from "@shared/schema";

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
  const [popups, setPopups] = useState<Popup[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (previewPopup) return; // 미리보기 모드면 일반 팝업 로드 안 함
    fetch("/api/popups")
      .then((r) => r.json())
      .then((data: Popup[]) => {
        const filtered = data.filter((p) => !isDismissedToday(p.id));
        if (filtered.length > 0) {
          setPopups(filtered);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, [previewPopup]);

  // 미리보기 모드
  if (previewPopup) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9998 }}>
        <div className="absolute inset-0 bg-black/50" onClick={onPreviewClose} />
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

  const current = popups[currentIdx];

  const handleClose = () => {
    if (currentIdx + 1 < popups.length) {
      setCurrentIdx((i) => i + 1);
    } else {
      setVisible(false);
    }
  };

  const handleDismissToday = () => {
    if (current) dismissToday(current.id);
    handleClose();
  };

  return (
    <AnimatePresence>
      {visible && current && (
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
            total={popups.length}
            current={currentIdx + 1}
          />
        </div>
      )}
    </AnimatePresence>
  );
}

function PopupCard({
  popup, onClose, onDismissToday, total, current, isPreview = false,
}: {
  popup: Popup;
  onClose: () => void;
  onDismissToday: () => void;
  total: number;
  current: number;
  isPreview?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="relative bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-md"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 상단 우측: 닫기 + 카운터 */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        {total > 1 && (
          <span className="px-2 py-1 rounded-full bg-black/30 text-white text-xs font-bold">
            {current} / {total}
          </span>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
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

      {/* 이미지 */}
      {popup.imageUrl && (
        <div className="w-full h-52 overflow-hidden bg-gray-100">
          <img src={popup.imageUrl} alt={popup.title} className="w-full h-full object-cover" />
        </div>
      )}

      {/* 내용 */}
      <div className="p-6">
        <h2 className="text-xl font-black text-gray-900 mb-2">{popup.title}</h2>
        {popup.content && (
          <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap mb-4">{popup.content}</p>
        )}
        <div className="flex items-center justify-between gap-3">
          {popup.linkUrl ? (
            <a
              href={popup.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              {popup.linkLabel || "자세히 보기"} <ExternalLink className="w-3.5 h-3.5" />
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
      </div>
    </motion.div>
  );
}
