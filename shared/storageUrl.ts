/**
 * 우리 Supabase Storage 의 공개 객체 주소인지 판정한다.
 *
 * **서버와 클라이언트가 같은 함수를 써야 한다.** 서버는 이 조건으로 AI 호출을
 * 거부하고, 클라이언트는 같은 조건으로 "AI로 읽기" 버튼을 비활성화한다.
 * 둘이 갈라지면 버튼은 눌리는데 서버가 막아서 교사가 이유를 알 수 없게 된다.
 *
 * 기준 주소(`base`)를 인자로 받는 이유: 서버는 `SUPABASE_URL`, 브라우저는
 * `VITE_SUPABASE_URL` 로 읽는 곳이 달라서 이 파일이 환경변수를 직접 보면 안 된다.
 *
 * 막는 것
 * - 다른 도메인 (임의 주소로 서버가 요청하게 만드는 것)
 * - `https` 가 아닌 것
 * - 공개 경로가 아닌 것 (서명 URL, 관리 API 경로)
 * - `https://우리도메인@evil.example.com/...` 처럼 사용자 정보로 호스트를 위장하는 것
 *   (`URL` 이 `hostname` 을 제대로 갈라 주므로 자연히 걸린다)
 */
export function isPublicStorageUrl(raw: string, base: string | undefined): boolean {
  if (!base) return false;

  let url: URL;
  let allowed: URL;
  try {
    url = new URL(raw);
    allowed = new URL(base);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.hostname !== allowed.hostname) return false;
  return url.pathname.startsWith("/storage/v1/object/public/");
}
