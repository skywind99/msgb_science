interface Props {
  url: string;
}

function getYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function YoutubeEmbed({ url }: Props) {
  const id = getYoutubeId(url);
  if (!id) return null;
  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-border shadow-md" style={{ paddingBottom: "56.25%" }}>
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}

export function isYoutubeUrl(url?: string | null): url is string {
  if (!url) return false;
  return /youtu(\.be|be\.com)/i.test(url);
}
