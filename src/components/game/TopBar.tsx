import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCountdown } from "@/lib/game/bs-calendar";
import { getMap } from "@/lib/game/map-ref";
import { useGame } from "@/lib/game/store";

const PROVINCE_TARGETS: Record<string, [number, number]> = {
  kathmandu: [85.324, 27.7172],
  pokhara: [83.9856, 28.2096],
  biratnagar: [87.2839, 26.4525],
  janakpur: [85.9266, 26.7271],
  hetauda: [85.0322, 27.4287],
  birendranagar: [81.6339, 28.6045],
  godawari: [80.5898, 28.9985],
  koshi: [87.3, 27.3],
  madhesh: [86.0, 26.8],
  bagmati: [85.3, 27.9],
  gandaki: [84.0, 28.5],
  lumbini: [82.5, 27.9],
  karnali: [82.5, 29.3],
  sudurpashchim: [81.0, 29.3],
};

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { theme, toggleTheme } = useGame();
  const [countdown, setCountdown] = useState(() => getCountdown());
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const id = setInterval(() => setCountdown(getCountdown()), 1000);
    return () => clearInterval(id);
  }, []);

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const flyTo = (key: string) => {
    const target = PROVINCE_TARGETS[key.trim().toLowerCase()];
    if (!target) return;
    getMap()?.flyTo({ center: target, zoom: 11, duration: 1800 });
    closeSearch();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-3 pt-3 sm:pt-4">
      <div className="pointer-events-auto glass-panel no-tap flex w-full max-w-2xl items-center gap-2 rounded-2xl px-2 py-2">
        <button
          onClick={onMenu}
          aria-label="Menu"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition hover:bg-foreground/5"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[9px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[10px]">
            B.S. {countdown.bsYear} · Baishakh 1
          </div>
          <div className="font-mono text-sm font-semibold leading-tight tracking-tight sm:text-base">
            <span className="tabular">{String(countdown.days).padStart(3, "0")}</span>
            <span className="text-muted-foreground">d </span>
            <span className="tabular">{String(countdown.hours).padStart(2, "0")}</span>
            <span className="text-muted-foreground">h </span>
            <span className="tabular">{String(countdown.minutes).padStart(2, "0")}</span>
            <span className="text-muted-foreground">m </span>
            <span className="tabular">{String(countdown.seconds).padStart(2, "0")}</span>
            <span className="text-muted-foreground">s</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {searchOpen ? (
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background/75 px-2">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && flyTo(query)}
                placeholder="Search place"
                className="h-9 w-[min(44vw,11rem)] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={closeSearch}
                aria-label="Close search"
                className="grid h-7 w-7 place-items-center rounded-lg hover:bg-foreground/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-foreground/5"
            >
              <Search className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-foreground/5"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
