import { cn } from "@/lib/cn";

type KeepTile = {
  n: string;
  label: string;
  state: "keep" | "dim" | "reject";
};

type KeepTilesProps = {
  tiles: KeepTile[];
};

export const KeepTiles = ({ tiles }: KeepTilesProps) => (
  <div className="grid min-w-[230px] flex-1 grid-cols-3 gap-2.5">
    {tiles.map((tile) => (
      <div
        key={tile.n}
        className={cn(
          "bg-elevated relative flex aspect-[3/2] flex-col justify-between p-2",
          tile.state === "keep" && "outline-pencil outline-2 outline-offset-2",
          tile.state === "dim" && "opacity-45",
        )}
      >
        <span className="font-mono text-edge text-[9.5px] leading-3 font-medium tracking-[0.1em]">{tile.n}</span>
        <span className="font-mono text-muted text-[10px] leading-3 font-medium tracking-[0.08em] uppercase">
          {tile.label}
        </span>
        {tile.state === "reject" ? (
          <svg
            viewBox="0 0 10 10"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-1.5 h-[calc(100%-12px)] w-[calc(100%-12px)]"
          >
            <path d="M1 1 L9 9 M9 1 L1 9" stroke="#ff4f6d" strokeWidth="0.5" strokeLinecap="round" />
          </svg>
        ) : null}
      </div>
    ))}
  </div>
);
