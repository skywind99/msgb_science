import { useRef, useState } from "react";
import { ImageIcon, Link2, Loader2, Maximize2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { uploadImage, uploadSummary } from "@/lib/imageUpload";
import { useToast } from "@/hooks/use-toast";

/**
 * 이미지 입력 — 파일 업로드와 URL 둘 다.
 *
 * 작성 화면과 수정 화면에 거의 같은 코드가 두 벌 있었다 (`ImageInput`,
 * `BlockImageInput`). 한쪽만 고쳐지는 일이 반복돼서 하나로 합쳤다.
 * 생김새 차이는 `variant` 로 둔다 — 대표 이미지는 크게, 본문 블록은 작게.
 *
 * URL 로 넣은 이미지는 **"저장"을 눌러야** 우리 서버로 미러링된다.
 * 누르지 않으면 외부 주소가 그대로 저장되고, 그 글은 나중에 "AI로 읽기" 를
 * 쓸 수 없다 (서버가 우리 도메인만 읽는다).
 */

/** 외부 URL → Storage 미러링. 실패하면 원래 URL 을 그대로 쓴다. */
async function mirrorImage(
  url: string,
  authHeaders: Record<string, string>
): Promise<string> {
  try {
    const res = await fetch("/api/mirror-image", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return url;
    const data = (await res.json()) as { url?: string };
    return data.url ?? url;
  } catch {
    return url;
  }
}

export interface ImageInputProps {
  value: string;
  onChange: (url: string) => void;
  authHeaders: Record<string, string>;
  /** `card` = 대표 이미지(큰 드롭존), `compact` = 본문 블록(한 줄짜리) */
  variant?: "card" | "compact";
  label?: string;
  placeholder?: string;
}

export function ImageInput({
  value,
  onChange,
  authHeaders,
  variant = "card",
  label,
  placeholder,
}: ImageInputProps) {
  const [mode, setMode] = useState<"url" | "file">("file");
  const [uploading, setUploading] = useState(false);
  const [mirroring, setMirroring] = useState(false);
  /** 미리보기를 눌렀을 때 원본 비율로 크게 보여준다. */
  const [zoomed, setZoomed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const compact = variant === "compact";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // 보내기 전에 브라우저에서 줄인다. 실패 이유는 항상 돌아온다.
      const result = await uploadImage(file, authHeaders);
      if (result.ok) {
        onChange(result.url);
        toast({ title: "이미지 업로드 완료", description: uploadSummary(result.prepared) });
      } else {
        toast({ title: "업로드 실패", description: result.message, variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleMirror = async () => {
    if (!value || !/^https?:\/\//i.test(value)) return;
    setMirroring(true);
    try {
      const mirrored = await mirrorImage(value, authHeaders);
      onChange(mirrored);
      if (mirrored !== value) toast({ title: "이미지가 서버에 저장되었습니다." });
    } finally {
      setMirroring(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ImageIcon className="w-3.5 h-3.5 text-primary" />
          {label}
        </div>
      )}

      {/* 탭: 파일 / URL */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            mode === "file"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="w-3 h-3" /> 파일 업로드
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
            mode === "url"
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Link2 className="w-3 h-3" /> URL 입력
        </button>
      </div>

      {mode === "url" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder ?? "https://example.com/image.jpg"}
              className="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-primary/20 bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            />
            {value && /^https?:\/\//i.test(value) && (
              <button
                type="button"
                onClick={handleMirror}
                disabled={mirroring}
                title="이 URL 이미지를 서버에 저장"
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {mirroring ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                저장
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            외부 URL 입력 후 <strong>저장</strong> 버튼을 누르면 이미지를 서버에 보관합니다.
          </p>
        </div>
      ) : (
        <div>
          <label
            className={`flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              compact ? "py-2.5" : "flex-col h-28"
            } ${
              uploading
                ? "border-primary/30 bg-primary/5"
                : "border-primary/30 hover:border-primary hover:bg-primary/5"
            }`}
          >
            {uploading ? (
              <>
                <Loader2
                  className={`${compact ? "w-4 h-4" : "w-6 h-6"} text-primary animate-spin`}
                />
                {compact && (
                  <span className="text-xs text-muted-foreground">업로드 중...</span>
                )}
              </>
            ) : (
              <>
                <Upload
                  className={`${compact ? "w-4 h-4 text-muted-foreground" : "w-6 h-6 text-primary/60"}`}
                />
                <span className="text-xs text-muted-foreground">클릭하여 이미지 선택</span>
                {!compact && (
                  <span className="text-[10px] text-muted-foreground/60">
                    JPG, PNG, GIF, WEBP
                  </span>
                )}
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        </div>
      )}

      {/* 미리보기. 올린 이미지가 실제로 어떻게 보이는지 확인할 수 있어야 하므로
          잘라내지 않고(object-contain) 전체를 보여준다. */}
      {value && /^https?:\/\//i.test(value) && (
        <div className="relative">
          {/* 눌러서 원본 비율로 크게 본다. 썸네일만 보고는 글자가 읽히는지 알 수 없다. */}
          <button
            type="button"
            onClick={() => setZoomed(true)}
            aria-label="이미지 크게 보기"
            className="group block w-full rounded-lg overflow-hidden border border-border focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <img
              src={value}
              alt=""
              className={`w-full ${compact ? "h-28" : "h-36"} object-contain bg-muted`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/55 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
              <Maximize2 className="w-3 h-3" /> 크게 보기
            </span>
          </button>

          {value.includes("supabase") && (
            <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-500/90 text-white text-[10px] font-bold pointer-events-none">
              ✓ 서버 저장됨
            </span>
          )}

          {/* Esc 와 바깥 클릭은 Dialog 가 처리한다. */}
          <Dialog open={zoomed} onOpenChange={setZoomed}>
            <DialogContent className="max-w-5xl p-2 sm:p-3">
              <DialogTitle className="sr-only">이미지 크게 보기</DialogTitle>
              <img
                src={value}
                alt=""
                className="w-full max-h-[90vh] object-contain rounded-lg bg-muted"
              />
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
