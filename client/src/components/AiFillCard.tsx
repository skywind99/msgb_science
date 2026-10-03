import { useRef, useState } from "react";
import {
  AlignLeft,
  ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { uploadImage, uploadSummary } from "@/lib/imageUpload";
import { useToast } from "@/hooks/use-toast";

/**
 * 글쓰기 화면 맨 위의 "AI로 채우기" 카드.
 *
 * 흩어져 있던 AI 입구를 한 곳으로 모은 것이다. 예전에는 대표 이미지 카드에
 * "AI로 읽기", 오른쪽 활동 패널에 "AI 입력" 이 따로 있어서 교사가 둘의 차이를
 * 알아야 했다. 지금은 "무엇을 줄 것인가"(사진이냐 글이냐)만 고르면 된다.
 *
 * **이미지를 고르고 올리는 것만으로는 AI 를 부르지 않는다.** 업로드와 분석은
 * 완전히 다른 단계이고, 분석은 버튼을 눌러야만 시작한다. 올린 직후 상태 줄에
 * "아직 분석하지 않았어요" 라고 적는 것도 그래서다.
 *
 * 호출과 결과 적용은 이 컴포넌트가 하지 않는다. `onFillFromImage` /
 * `onFillFromText` 로 올려 보내고, 받는 쪽(`CreatePostDialog`)이 기존
 * `readImage` / `readText` + `applyAiResult` 를 그대로 쓴다.
 */

/**
 * 이미지가 바뀌었다는 안내. 받는 쪽이 정한다 — 카드는 그릴 뿐이다.
 *
 * **AI 카드에서 바꿨을 때만 온다.** 대표 이미지 줄에서 바꾼 경우에는 오지 않는다.
 */
export type AiImageNotice = "replaced" | "cleared";

export type AiFillCardProps = {
  authHeaders: Record<string, string>;
  /** 올린 이미지 주소. 대표 이미지와 같은 값을 쓴다. */
  imageUrl: string;
  onImageChange: (url: string) => void;
  /**
   * AI 가 실제로 읽은 이미지 주소. 아직 안 읽었으면 `""`.
   *
   * 이걸 `imageUrl` 과 **맞춰 봐서** "AI가 읽었어요" 를 띄운다. 예전에는 카드
   * 안의 `analyzed` 플래그 하나였는데, 그러면 대표 이미지 줄에서 사진을 바꿔도
   * 플래그가 남아서 **다른 사진을 가리키며 "읽었어요" 라고 말했다.**
   */
  readImageUrl: string;
  /** 주황 안내. 지울 AI 내용이 없으면 받는 쪽이 `null` 로 내린다. */
  notice: AiImageNotice | null;
  /** [새 이미지로 다시 읽기] — 지금 올라와 있는 이미지로 다시 호출한다. */
  onReread: () => void;
  /** [AI가 채운 내용 지우기] — 고치지 않은 AI 값만 지운다. */
  onClearAi: () => void;
  /** 안내의 × */
  onDismissNotice: () => void;
  /** 버튼을 눌렀을 때만 불린다. 채운 항목 수를 돌려주면 상태 줄에 쓴다. */
  onFillFromImage: () => Promise<void>;
  onFillFromText: (text: string) => Promise<void>;
  /** 호출 중인 모드. 없으면 멈춰 있는 상태. */
  busy: "image" | "text" | null;
  /** AI 키가 쓸 수 있는지. 아직 모르면 `undefined`. */
  ready: boolean | undefined;
  /** 직전 호출 결과. 성공 문구 또는 `AI_FILL_MESSAGES` 의 오류 문구. */
  status: { kind: "ok" | "error"; message: string } | null;
};

type Tab = "image" | "text";

const TAB_LABEL: Record<Tab, { label: string; icon: React.ReactNode }> = {
  image: { label: "이미지", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  text: { label: "글 붙여넣기", icon: <AlignLeft className="w-3.5 h-3.5" /> },
};

export function AiFillCard({
  authHeaders,
  imageUrl,
  onImageChange,
  readImageUrl,
  notice,
  onReread,
  onClearAi,
  onDismissNotice,
  onFillFromImage,
  onFillFromText,
  busy,
  ready,
  status,
}: AiFillCardProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("image");
  /**
   * 우리가 올린 파일의 이름과 그때 받은 주소.
   *
   * 주소를 함께 쥐는 이유는 하나다 — 대표 이미지 줄에서 사진을 바꾸면 `imageUrl`
   * 만 달라진다. 그때 예전 파일 이름을 계속 보여주면 거짓말이 된다.
   */
  const [uploaded, setUploaded] = useState<{ url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState("");
  /** 붙여 넣은 글로 한 번이라도 채웠는가. 글 탭에는 이미지가 없어 따로 센다. */
  const [textAnalyzed, setTextAnalyzed] = useState(false);

  const disabled = ready === false || busy !== null || uploading;

  /**
   * 지금 올라와 있는 이미지가 **AI 가 읽은 그 이미지인가.**
   * 상태를 따로 두지 않고 맞춰 본다. 어긋날 수 있는 플래그를 하나 줄인다.
   */
  const imageAnalyzed = !!imageUrl && imageUrl === readImageUrl;
  const fileName = uploaded && uploaded.url === imageUrl ? uploaded.name : "";

  /** 파일을 고르면 **올리기만** 한다. 분석은 버튼을 눌러야 시작한다. */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage(file, authHeaders);
      if (result.ok) {
        // 주소만 올려 보낸다. **AI 를 부르지 않는다.** 안내를 띄울지는 받는 쪽이 정한다.
        setUploaded({ url: result.url, name: file.name });
        onImageChange(result.url);
        toast({ title: "이미지를 올렸습니다", description: uploadSummary(result.prepared) });
      } else {
        toast({ title: "업로드 실패", description: result.message, variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** 사진만 뗀다. **AI 가 채운 값은 건드리지 않는다** — 지우는 건 버튼으로만. */
  const clearImage = () => {
    setUploaded(null);
    onImageChange("");
  };

  const runText = async () => {
    if (!text.trim()) {
      toast({ title: "붙여 넣은 글이 없어요", description: "안내문을 붙여 넣고 다시 눌러 주세요." });
      return;
    }
    await onFillFromText(text.trim());
    setTextAnalyzed(true);
  };

  const label = (done: boolean) => (done ? "다시 읽기" : "AI로 채우기");

  return (
    <section className="rounded-2xl border-2 border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-violet-800">
          <Sparkles className="w-4 h-4" />
          AI로 채우기
          <span className="font-normal text-muted-foreground">(선택)</span>
        </h3>

        {/* 탭 */}
        <div className="flex gap-1 p-1 rounded-lg bg-white/70">
          {(["image", "text"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                tab === t ? "bg-white shadow text-violet-800" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABEL[t].icon}
              {TAB_LABEL[t].label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        안내문 사진이나 글을 주면 제목·본문·활동 정보를 채워 줍니다. 꼭 쓰지 않아도 됩니다.
      </p>

      {tab === "image" ? (
        !imageUrl ? (
          <label
            className={`flex flex-col items-center justify-center gap-2 w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              uploading
                ? "border-violet-300 bg-violet-100/50"
                : "border-violet-300 hover:border-violet-500 hover:bg-violet-100/50"
            }`}
          >
            {uploading ? (
              <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
            ) : (
              <>
                <Upload className="w-6 h-6 text-violet-500" />
                <span className="text-xs font-semibold text-violet-800">클릭하여 이미지 선택</span>
                <span className="text-[10px] text-muted-foreground">JPG, PNG, GIF, WEBP</span>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
            />
          </label>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-white p-3">
            <img
              src={imageUrl}
              alt=""
              className="w-16 h-20 shrink-0 object-contain bg-muted rounded-lg border border-border"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-foreground truncate">
                {fileName || "올린 이미지"}
              </p>
              {/* 올린 것과 분석한 것은 다른 단계다. 눌러야 분석한다.
                  사진을 바꾸면 `imageAnalyzed` 가 스스로 풀려 여기로 되돌아온다. */}
              <p className="text-xs text-muted-foreground mt-0.5">
                {imageAnalyzed ? "AI가 읽었어요." : "올렸어요 · 아직 분석하지 않았어요"}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onFillFromImage}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy === "image" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {busy === "image" ? "읽는 중…" : label(imageAnalyzed)}
              </button>
              <button
                type="button"
                onClick={clearImage}
                disabled={busy !== null}
                aria-label="이미지 삭제"
                className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"안내문을 붙여 넣으세요.\n예) 2026 천체관측 캠프 / 12월 19일(금) 20:00 ~ 다음날 01:00 / 학교 옥상 / 2학년 15명"}
            className="w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all resize-y"
          />
          <button
            type="button"
            onClick={runText}
            disabled={disabled || !text.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy === "text" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {busy === "text" ? "읽는 중…" : label(textAnalyzed)}
          </button>
        </div>
      )}

      {/*
        이미지가 바뀌었거나 지워졌다는 안내.

        **여기서 AI 를 자동으로 부르지 않고, 채운 값을 자동으로 지우지도 않는다.**
        사진을 바꿨다는 이유로 교사가 고쳐 둔 값이 사라지면 되돌릴 길이 없고,
        호출이 저절로 나가면 "버튼을 누를 때만 보낸다" 는 약속이 깨진다.
        그래서 알려 주기만 하고, 둘 중 어느 쪽이든 누르게 한다.
      */}
      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 space-y-2">
          <div className="flex gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700" />
            <span className="flex-1 text-xs text-amber-800">
              {notice === "replaced"
                ? "이미지가 바뀌었어요. 채워진 내용은 이전 이미지를 읽은 거예요."
                : "이미지를 삭제했어요. AI가 채운 내용은 그대로 남아 있어요."}
            </span>
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="안내 닫기"
              className="shrink-0 p-0.5 -m-0.5 rounded text-amber-700 hover:bg-amber-200/70 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-5">
            {notice === "replaced" && (
              <button
                type="button"
                onClick={onReread}
                disabled={disabled || !imageUrl}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy === "image" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                새 이미지로 다시 읽기
              </button>
            )}
            <button
              type="button"
              onClick={onClearAi}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              AI가 채운 내용 지우기
            </button>
          </div>
        </div>
      )}

      {/* 상태 줄 — 성공 문구와 오류 문구(AI_FILL_MESSAGES)가 같은 자리에 온다. */}
      {ready === false ? (
        <p className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>관리자가 AI를 설정하지 않았어요.</span>
        </p>
      ) : status ? (
        <p
          className={`flex gap-2 text-xs rounded-lg p-2.5 border ${
            status.kind === "ok"
              ? "text-violet-700 bg-violet-50 border-violet-200"
              : "text-destructive bg-destructive/5 border-destructive/20"
          }`}
        >
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{status.message}</span>
        </p>
      ) : null}

      {/* 개인정보 안내 — **항상 보인다.** 누르기 전에 읽혀야 한다. */}
      <p className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          올리기만 해서는 분석하지 않아요. <strong>버튼을 누를 때만</strong> AI 서비스(Google
          Gemini, 장애 시 Groq)로 전송됩니다. 무료 이용 중에는 입력한 내용이 공급자의 서비스
          개선에 쓰일 수 있습니다. 학생의 이름·얼굴이 나온 사진이나 개인정보가 담긴 글은 보내지
          마세요.
        </span>
      </p>
    </section>
  );
}
