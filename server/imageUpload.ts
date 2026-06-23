import { createClient } from "@supabase/supabase-js";

declare const process: { env: Record<string, string | undefined> };

const BUCKET = "news-images";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY; // service_role key (서버 전용)
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * 외부 이미지 URL → Supabase Storage에 업로드 → 영구 public URL 반환
 * 실패 시 원본 URL 그대로 반환 (graceful fallback)
 */
export async function mirrorImageToStorage(
  externalUrl: string
): Promise<string> {
  try {
    const supabase = getSupabase();
    if (!supabase) return externalUrl; // env 미설정 시 원본 사용

    // 이미지 다운로드
    const res = await fetch(externalUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; school-site/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return externalUrl;

    const contentType =
      res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) return externalUrl;

    const buffer = await res.arrayBuffer();

    // 파일명: URL을 해싱 대신 간단한 경로 정규화로 생성 (중복 방지)
    const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const hash = Buffer.from(externalUrl).toString("base64url").slice(0, 32);
    const filename = `scraped/${hash}.${ext}`;

    // 이미 업로드된 파일이면 그냥 public URL 반환
    const { data: existing } = await supabase.storage
      .from(BUCKET)
      .getPublicUrl(filename);
    // getPublicUrl은 실제 존재 여부와 무관하게 URL을 반환하므로
    // head 요청으로 존재 확인
    const headRes = await fetch(existing.publicUrl, { method: "HEAD" });
    if (headRes.ok) return existing.publicUrl;

    // 업로드
    const { error } = await supabase.storage.from(BUCKET).upload(
      filename,
      new Blob([buffer], { type: contentType }),
      { contentType, upsert: false }
    );
    if (error && error.message !== "The resource already exists") {
      console.error("[imageUpload] upload error:", error.message);
      return externalUrl;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
  } catch (err) {
    console.error("[imageUpload] mirror failed:", err);
    return externalUrl;
  }
}

/**
 * 클라이언트에서 올린 raw 바이트 → Supabase Storage 업로드
 * `fieldname` 예: "post-images/1719123456789.jpg"
 */
export async function uploadBufferToStorage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string | null> {
  try {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, new Blob([buffer], { type: contentType }), {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error("[imageUpload] upload error:", error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return data.publicUrl;
  } catch (err) {
    console.error("[imageUpload] uploadBuffer failed:", err);
    return null;
  }
}
