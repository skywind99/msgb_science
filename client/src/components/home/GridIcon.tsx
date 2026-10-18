/**
 * 한 화면 개수를 **배치 모양으로** 보여주는 작은 격자 아이콘.
 *
 * 숫자 "4 · 6 · 9 · 12" 만 보여줄 때는 그 숫자가 "몇 열로 보이는지" 를 말해 주지
 * 않았다. 4 와 6 중 무엇이 더 크게 보이는지 눌러 봐야 알았다. 격자 모양이면
 * 누르기 전에 보인다.
 *
 * lucide 에 2×2(`Grid2x2`)와 3×3(`Grid3x3`)은 있지만 **3×2 와 4×3 이 없다.**
 * 새 의존성을 더하지 않기로 했으므로 열·행을 받아 직접 그린다 — 네 가지가 같은
 * 규칙으로 그려져 크기와 간격이 저절로 맞는다.
 */

export function GridIcon({
  cols,
  rows,
  className = "w-4 h-4",
}: {
  cols: number;
  rows: number;
  className?: string;
}) {
  /** 칸 사이 간격과 테두리 여백. viewBox 24 기준으로 눈에 맞게 잡은 값이다. */
  const gap = 2.5;
  const pad = 2;
  const span = 24 - pad * 2;
  const w = (span - gap * (cols - 1)) / cols;
  const h = (span - gap * (rows - 1)) / rows;

  const cells: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: pad + c * (w + gap), y: pad + r * (h + gap) });
    }
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      /* 색은 글자색을 따라간다. 선택된 버튼에서 자동으로 반전된다. */
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {cells.map((cell, i) => (
        <rect
          key={i}
          x={cell.x}
          y={cell.y}
          width={w}
          height={h}
          /* 칸이 작아지면 둥글기도 줄여야 네모로 보인다. */
          rx={Math.min(1.5, Math.min(w, h) / 3)}
        />
      ))}
    </svg>
  );
}

/** 개수 → 격자 모양. `BoardView` 의 열 수 설정과 같은 값이어야 한다. */
export const GRID_SHAPE: Record<number, { cols: number; rows: number }> = {
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  9: { cols: 3, rows: 3 },
  12: { cols: 4, rows: 3 },
};
