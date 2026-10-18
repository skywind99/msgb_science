import { QRCodeSVG } from "qrcode.react";

/**
 * 신청 페이지 QR.
 *
 * 멀리서 보는 화면이라 학생이 걸어가 휴대폰으로 찍는다. 그래서 주소가
 * **전체 주소여야** 한다 — 상대 경로(`/posts/12`)로는 카메라가 어디로 갈지 모른다.
 * `tvQrUrl` 이 `new URL` 로 한 번 걸러 준다.
 *
 * 흰 바탕에 여백(`includeMargin`)을 둔다. 짙은 남색 위에 바로 올리면 QR 둘레가
 * 배경과 섞여 카메라가 모서리를 못 찾는다.
 *
 * `level="M"` — 기본값 `L` 보다 오류 정정이 세다. TV 화면을 비스듬히 찍거나 반사가
 * 있을 때 차이가 난다. 크기는 커지지만 `/posts/12` 는 짧아서 영향이 작다.
 */
export function TvQr({ url, size = 112 }: { url: string; size?: number }) {
  return (
    <div className="rounded-xl bg-white p-2 shadow-lg">
      <QRCodeSVG value={url} size={size} level="M" marginSize={1} />
    </div>
  );
}

export default TvQr;
