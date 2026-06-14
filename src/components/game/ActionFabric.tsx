import { Locate, Plus, Minus } from "lucide-react";
import { useGame } from "@/lib/game/store";
import { getMap } from "@/lib/game/map-ref";

export function ActionFabric() {
  const position = useGame((s) => s.position);

  const recenter = () => {
    const m = getMap();
    if (!m || !position) return;
    m.flyTo({ center: [position.lng, position.lat], zoom: 16, duration: 1800 });
  };

  const zoom = (delta: number) => {
    const m = getMap();
    if (!m) return;
    m.zoomTo(m.getZoom() + delta, { duration: 250 });
  };

  return (
    <div className="pointer-events-none fixed bottom-4 left-3 z-30 flex flex-col gap-2">
      <button
        onClick={recenter}
        aria-label="Recenter"
        className="pointer-events-auto glass-panel no-tap grid h-12 w-12 place-items-center rounded-full shadow-xl hover:bg-foreground/[0.04] active:scale-95 transition"
      >
        <Locate className="h-5 w-5" />
      </button>
      <div className="pointer-events-auto glass-panel no-tap flex flex-col overflow-hidden rounded-xl shadow-xl">
        <button
          onClick={() => zoom(1)}
          aria-label="Zoom in"
          className="grid h-11 w-11 place-items-center hover:bg-foreground/[0.04] active:scale-95 transition border-b border-border/60"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => zoom(-1)}
          aria-label="Zoom out"
          className="grid h-11 w-11 place-items-center hover:bg-foreground/[0.04] active:scale-95 transition"
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
