import { useState } from "react";
import { AlignLeft, ArrowDown, ArrowUp, ImageIcon, Loader2, Plus, ScanLine, Trash2, Youtube } from "lucide-react";
import {
  newEditorBlock,
  type EditorBlock,
  type EditorBlockType,
} from "@shared/postBlocks";
import { ImageInput } from "@/components/ImageInput";
import { extractText } from "@/lib/ocr";
import { useToast } from "@/hooks/use-toast";

/**
 * 본문 블록 편집기.
 *
 * 블록 하나에 종류 하나다 — 글상자 / 사진 / 유튜브.
 * 예전에는 블록 하나에 이미지·유튜브·글 칸이 모두 있어서, 사진만 넣고
 * 싶어도 세 칸을 보게 됐고 순서도 바꿀 수 없었다.
 *
 * 저장 형태는 바뀌지 않는다. `toContentBlocks` 가 칸 하나만 채워 내보낸다
 * (`shared/postBlocks.ts`).
 */

const TYPE_META: Record<
  EditorBlockType,
  { label: string; dot: string; icon: React.ReactNode }
> = {
  text: {
    label: "글상자",
    dot: "bg-primary",
    icon: <AlignLeft className="w-3.5 h-3.5" />,
  },
  photo: {
    label: "사진",
    dot: "bg-emerald-500",
    icon: <ImageIcon className="w-3.5 h-3.5" />,
  },
  youtube: {
    label: "유튜브 영상",
    dot: "bg-red-500",
    icon: <Youtube className="w-3.5 h-3.5" />,
  },
};

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all";

function IconButton({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-lg text-muted-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function PostBlockEditor({
  blocks,
  onChange,
  authHeaders,
}: {
  blocks: EditorBlock[];
  onChange: (next: EditorBlock[]) => void;
  authHeaders: Record<string, string>;
}) {
  const { toast } = useToast();

  /** 글자를 뽑는 중인 블록 id. 한 번에 하나만 돌린다. */
  const [ocrBusy, setOcrBusy] = useState<string | null>(null);
  /** 사진이 없는데 눌렀을 때의 인라인 안내. */
  const [ocrError, setOcrError] = useState<Record<string, string>>({});

  const setValue = (id: string, value: string) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, value } : b)));

  const add = (type: EditorBlockType) => onChange([...blocks, newEditorBlock(type)]);

  const remove = (id: string) => {
    if (blocks.length <= 1) {
      toast({ title: "본문 블록이 최소 1개는 있어야 합니다." });
      return;
    }
    onChange(blocks.filter((b) => b.id !== id));
  };

  /**
   * 사진에서 글자를 뽑아 **바로 아래 새 글상자**로 넣는다.
   *
   * 기존 글은 건드리지 않는다 — 덮어쓰면 교사가 쓴 내용이 사라진다.
   * 브라우저 안에서만 처리하므로 사진은 어디로도 전송되지 않는다.
   */
  const runOcr = async (block: EditorBlock, index: number) => {
    const url = block.value.trim();
    if (!url) {
      setOcrError((e) => ({ ...e, [block.id]: "사진을 먼저 선택하세요." }));
      return;
    }
    setOcrError((e) => ({ ...e, [block.id]: "" }));
    setOcrBusy(block.id);
    try {
      const result = await extractText(url);
      if (!result.ok) {
        setOcrError((e) => ({ ...e, [block.id]: result.message }));
        return;
      }
      const next = [...blocks];
      next.splice(index + 1, 0, newEditorBlock("text", result.text));
      onChange(next);
      toast({ title: "읽은 글을 이 사진 아래 글상자에 넣었습니다." });
    } finally {
      setOcrBusy(null);
    }
  };

  /** 블록을 한 칸 옮긴다. 끝이면 아무 일도 하지 않는다. */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        const meta = TYPE_META[block.type];
        return (
          <div
            key={block.id}
            className="rounded-xl border border-border bg-card p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
              <span className="flex items-center gap-2 text-xs font-bold text-foreground">
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
              <span className="flex items-center">
                <IconButton
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  label="위로 이동"
                >
                  <ArrowUp className="w-4 h-4" />
                </IconButton>
                <IconButton
                  onClick={() => move(idx, 1)}
                  disabled={idx === blocks.length - 1}
                  label="아래로 이동"
                >
                  <ArrowDown className="w-4 h-4" />
                </IconButton>
                <IconButton onClick={() => remove(block.id)} label="블록 삭제" danger>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </span>
            </div>

            {block.type === "text" && (
              <textarea
                value={block.value}
                onChange={(e) => setValue(block.id, e.target.value)}
                rows={3}
                placeholder="설명이나 본문 내용을 입력하세요"
                className={`${inputClass} resize-y`}
              />
            )}

            {block.type === "photo" && (
              <div className="space-y-2">
                <ImageInput
                  value={block.value}
                  onChange={(url) => {
                    setValue(block.id, url);
                    setOcrError((e) => ({ ...e, [block.id]: "" }));
                  }}
                  authHeaders={authHeaders}
                  variant="compact"
                  placeholder="이미지 URL 또는 파일 업로드"
                />

                <button
                  type="button"
                  onClick={() => runOcr(block, idx)}
                  disabled={ocrBusy !== null}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border-2 border-border bg-background hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {ocrBusy === block.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ScanLine className="w-3.5 h-3.5" />
                  )}
                  {ocrBusy === block.id ? "읽는 중…" : "텍스트 추출"}
                </button>

                {ocrError[block.id] && (
                  <p className="text-xs text-destructive font-medium">{ocrError[block.id]}</p>
                )}
              </div>
            )}

            {block.type === "youtube" && (
              <input
                type="text"
                value={block.value}
                onChange={(e) => setValue(block.id, e.target.value)}
                placeholder="https://youtu.be/... 영상 링크"
                className={inputClass}
              />
            )}
          </div>
        );
      })}

      {/* 사진은 전송되지 않는다. 다만 첫 호출에는 학습 데이터를 내려받느라 시간이 걸린다. */}
      <p className="text-xs text-muted-foreground px-1">
        사진 블록의 <strong>텍스트 추출</strong>은 브라우저 안에서만 처리됩니다. 사진은
        어디로도 전송되지 않아요. 처음 한 번은 준비에 시간이 걸립니다.
      </p>

      {/* + 추가 줄 */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border-2 border-dashed border-border">
        <span className="px-1 text-xs font-semibold text-muted-foreground">
          <Plus className="w-3.5 h-3.5 inline -mt-0.5" /> 추가
        </span>
        {(["text", "photo", "youtube"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => add(type)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border-2 border-border bg-background hover:border-primary hover:text-primary transition-colors"
          >
            {TYPE_META[type].icon}
            {TYPE_META[type].label}
          </button>
        ))}
      </div>
    </div>
  );
}
