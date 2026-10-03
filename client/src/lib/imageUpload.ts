/**
 * 업로드 전 이미지 줄이기.
 *
 * **배경**: Vercel 함수의 요청 본문 한도가 4.5MB 다. 요즘 스마트폰 사진은 그대로면
 * 넘기기 쉽고, 넘으면 413 `FUNCTION_PAYLOAD_TOO_LARGE` 로 막힌다. 예전에는 그
 * 실패가 조용히 `null` 로 끝나서 교사가 이유를 알 수 없었다.
 *
 * 그래서 보내기 전에 브라우저에서 줄인다. 새 의존성 없이 `createImageBitmap` +
 * canvas 만 쓴다. 서버 코드는 건드리지 않는다.
 */

/** 줄이기 기준. **바꿀 일이 생기면 여기만 고친다.** */
export const RESIZE = {
  /** 긴 변 최대 픽셀. 안내문·포스터를 읽을 수 있는 선에서 넉넉하게. */
  maxEdge: 2400,
  /** JPEG 품질. 0.85 면 글자가 뭉개지지 않는다. */
  quality: 0.85,
  /** 이보다 작고 긴 변도 기준 안이면 그대로 보낸다. 괜히 다시 압축할 이유가 없다. */
  skipBelowBytes: 1024 * 1024,
  /** Vercel 함수 요청 본문 한도. 이걸 넘을 것 같으면 보내지 않고 안내한다. */
  requestLimitBytes: Math.floor(4.5 * 1024 * 1024),
} as const;

/** 줄이지 않는 형식. 움직이는 GIF 는 첫 장만 남고, SVG 는 래스터로 만들면 손해다. */
const SKIP_TYPES = ["image/gif", "image/svg+xml"];

export type PreparedImage = {
  blob: Blob;
  contentType: string;
  /** 화면 안내용. 줄이지 않았으면 `original` 과 같다. */
  bytes: number;
  originalBytes: number;
  width: number | null;
  height: number | null;
  /** 줄였는지. 안 줄였으면 이유. */
  resized: boolean;
  note?: string;
};

/**
 * 보낼 수 있는 형태로 다듬는다. **실패해도 던지지 않는다** — 원본으로 시도한다.
 *
 * HEIC 처럼 브라우저가 못 읽는 형식은 `createImageBitmap` 이 실패한다.
 * 그때는 원본을 그대로 보내되, 한도를 넘을 것 같으면 호출하는 쪽이 막는다.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const base = {
    originalBytes: file.size,
    width: null,
    height: null,
    resized: false,
  };

  if (SKIP_TYPES.includes(file.type)) {
    return { ...base, blob: file, contentType: file.type, bytes: file.size, note: "움직이는 그림이나 벡터라 그대로 보냅니다." };
  }

  let bitmap: ImageBitmap;
  try {
    // `imageOrientation: "from-image"` 가 EXIF 회전을 적용한다.
    // 이게 없으면 세로로 찍은 폰 사진이 눕는다.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC 등 브라우저가 못 읽는 형식. 원본으로 시도한다.
    return { ...base, blob: file, contentType: file.type || "image/jpeg", bytes: file.size, note: "이 형식은 브라우저가 줄일 수 없어 원본으로 보냅니다." };
  }

  try {
    const { width, height } = bitmap;
    const longest = Math.max(width, height);

    // 이미 작으면 그대로. 다시 압축하면 화질만 깎인다.
    if (file.size < RESIZE.skipBelowBytes && longest <= RESIZE.maxEdge) {
      return { ...base, blob: file, contentType: file.type, bytes: file.size, width, height };
    }

    const scale = longest > RESIZE.maxEdge ? RESIZE.maxEdge / longest : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ...base, blob: file, contentType: file.type, bytes: file.size, width, height };
    }

    // JPEG 은 투명을 못 담는다. 흰 배경을 먼저 깔지 않으면 투명한 곳이 검게 나온다.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", RESIZE.quality)
    );
    if (!blob) {
      return { ...base, blob: file, contentType: file.type, bytes: file.size, width, height };
    }

    // 줄였는데 오히려 커졌으면(작은 PNG 등) 원본을 쓴다.
    if (blob.size >= file.size && longest <= RESIZE.maxEdge) {
      return { ...base, blob: file, contentType: file.type, bytes: file.size, width, height };
    }

    return {
      originalBytes: file.size,
      blob,
      contentType: "image/jpeg",
      bytes: blob.size,
      width: w,
      height: h,
      resized: true,
    };
  } finally {
    bitmap.close();
  }
}

export type UploadOutcome =
  | { ok: true; url: string; prepared: PreparedImage }
  | { ok: false; message: string };

/** 사람이 읽는 용량. */
export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;

/**
 * 줄여서 올린다. **실패 이유가 항상 돌아온다** — 예전처럼 조용히 `null` 로 끝나지 않는다.
 */
export async function uploadImage(
  file: File,
  authHeaders: Record<string, string>
): Promise<UploadOutcome> {
  const prepared = await prepareImage(file);

  // 줄여도 한도를 넘을 것 같으면 **요청을 보내지 않는다.** 보내 봐야 413 이다.
  if (prepared.bytes > RESIZE.requestLimitBytes) {
    return {
      ok: false,
      message: `이미지가 너무 큽니다 (${formatBytes(prepared.bytes)}). 서버가 받을 수 있는 한도는 ${formatBytes(
        RESIZE.requestLimitBytes
      )} 입니다. 사진 앱에서 크기를 줄여 다시 시도해 주세요.`,
    };
  }

  let res: Response;
  try {
    res = await fetch("/api/upload-image", {
      method: "POST",
      headers: { "Content-Type": prepared.contentType, ...authHeaders },
      body: prepared.blob,
    });
  } catch {
    return { ok: false, message: "업로드 중 연결이 끊겼습니다. 잠시 후 다시 시도해 주세요." };
  }

  if (res.status === 413) {
    return {
      ok: false,
      message: `이미지가 너무 커서 서버가 거부했습니다 (${formatBytes(prepared.bytes)}). 더 작은 사진으로 올려 주세요.`,
    };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: body?.message ?? `업로드에 실패했습니다 (${res.status}).` };
  }

  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  if (!data?.url) return { ok: false, message: "업로드는 됐지만 주소를 받지 못했습니다." };

  return { ok: true, url: data.url, prepared };
}

/** 업로드 성공 토스트에 쓸 한 줄. 줄였으면 얼마나 줄었는지 보여준다. */
export function uploadSummary(p: PreparedImage): string | undefined {
  if (p.note) return p.note;
  if (!p.resized) return undefined;
  return `${formatBytes(p.originalBytes)} → ${formatBytes(p.bytes)}${
    p.width && p.height ? ` (${p.width}×${p.height})` : ""
  }`;
}
