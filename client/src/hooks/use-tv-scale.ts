import { useEffect, useState } from "react";

/**
 * 1920×1080 으로 짠 화면을 **지금 화면에 맞게 통째로 확대·축소한다.**
 *
 * TV 화면의 크기는 전부 고정 px 다 — 뉴스 영역 540, 카드 폭 400, 제목 54px.
 * 멀리서 읽히는 크기를 맞추려면 그래야 하는데, 그러면 **1920×1080 이 아닌 화면에서
 * 비율이 무너진다.** 2560×1440 모니터에서는 모든 것이 3/4 크기로 보이고 아래가
 * 크게 빈다. 4K TV 에서는 절반 크기가 된다.
 *
 * `transform: scale()` 로 무대 전체를 늘리면 **어느 화면에서나 같은 그림**이 된다.
 * 글자 크기를 다시 계산할 필요가 없고, 데스크톱에서 본 모습이 곧 TV 에서 보일
 * 모습이라 **병합 전에 확인할 수 있다.**
 *
 * 가로세로 비가 다르면(예: 16:10) 짧은 쪽에 맞춰 남는 자리는 배경색으로 둔다 —
 * 잘리는 것보다 낫다.
 */
export function useTvScale(designW = 1920, designH = 1080): number {
  const [scale, setScale] = useState(() =>
    typeof window === "undefined"
      ? 1
      : Math.min(window.innerWidth / designW, window.innerHeight / designH)
  );

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / designW, window.innerHeight / designH));

    fit();
    window.addEventListener("resize", fit);
    // 전체 화면(F)에 들어가고 나올 때 크기가 바뀐다. `resize` 가 늦게 오는
    // 브라우저가 있어 따로 듣는다.
    document.addEventListener("fullscreenchange", fit);

    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, [designW, designH]);

  return scale;
}
