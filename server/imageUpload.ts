import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

declare const process: { env: Record<string, string | undefined> };

export const BUCKET = "news-images";

/**
 * Supabase 클라이언트 생성.
 *
 * supabase-js 2.109+ 는 클라이언트를 만들 때 RealtimeClient를 초기화하는데,
 * 여기에 native WebSocket 전역이 필요하다. Node 22부터 제공되므로 Node 20에서는
 * "Node.js 20 detected without native WebSocket support" 예외가 난다.
 * Storage만 쓰더라도 생성 단계에서 막히기 때문에 ws를 트랜스포트로 넘긴다.
 * (Node 22+ 에서도 그대로 동작한다.)
 */
export function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    realtime: { transport: ws as unknown as never },
  });
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY; // service_role key (서버 전용)
  if (!url || !key) return null;
  try {
    return createSupabaseClient(url, key);
  } catch (err) {
    console.error("[imageUpload] Supabase 클라이언트 생성 실패:", err);
    return null;
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
export type UploadResult =
  | { ok: true; url: string }
  /** reason: 서버 로그용 상세 원인 / userMessage: 관리자에게 보여줄 문구 */
  | { ok: false; reason: string; userMessage: string };

export async function uploadBufferToStorage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    const missing = [
      !url && "SUPABASE_URL",
      !key && "SUPABASE_SERVICE_KEY",
    ].filter(Boolean).join(", ");
    return {
      ok: false,
      reason: `환경변수 미설정: ${missing}`,
      userMessage: `Storage 설정이 없습니다. 서버 환경변수(${missing})를 확인하세요.`,
    };
  }

  let supabase: SupabaseClient;
  try {
    supabase = createSupabaseClient(url, key);
  } catch (err) {
    return {
      ok: false,
      reason: `Supabase 클라이언트 생성 실패: ${errText(err)}`,
      userMessage:
        "Storage 클라이언트 초기화에 실패했습니다. 서버 로그를 확인하세요.",
    };
  }

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, new Blob([buffer], { type: contentType }), {
        contentType,
        upsert: true,
      });

    if (error) {
      return {
        ok: false,
        reason: `Storage 업로드 거부 (버킷 ${BUCKET}): ${error.message}`,
        userMessage: `업로드에 실패했습니다: ${error.message}`,
      };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return { ok: true, url: data.publicUrl };
  } catch (err) {
    return {
      ok: false,
      reason: `Storage 업로드 중 예외: ${errText(err)}`,
      userMessage: "업로드 중 오류가 발생했습니다. 서버 로그를 확인하세요.",
    };
  }
}
