import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ActionFabric } from "@/components/game/ActionFabric";
import { GameMap } from "@/components/game/GameMap";
import { Leaderboard } from "@/components/game/Leaderboard";
import { MenuSheet } from "@/components/game/MenuSheet";
import { OnboardingModal } from "@/components/game/OnboardingModal";
import { TerritoryInspector } from "@/components/game/TerritoryInspector";
import { TopBar } from "@/components/game/TopBar";
import { ToastContainer } from "@/components/game/Toast";
import { getMap } from "@/lib/game/map-ref";
import { useGame } from "@/lib/game/store";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Playing · Nepal Territory Conquest" },
      { name: "description", content: "Live territory conquest map." },
    ],
  }),
  component: PlayScreen,
  ssr: false,
});

function PlayScreen() {
  const navigate = useNavigate();
  const user = useGame((s) => s.user);
  const setPosition = useGame((s) => s.setPosition);
  const claimCurrentPosition = useGame((s) => s.claimCurrentPosition);
  const hydrate = useGame((s) => s.hydrateMockState);
  const simulateTick = useGame((s) => s.simulateTick);
  const [keys, setKeys] = useState(new Set<string>());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastGpsRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const gpsActiveRef = useRef(false); // true = real GPS providing position, WASD disabled

  useEffect(() => {
    if (!user) navigate({ to: "/" });
  }, [user, navigate]);

  useEffect(() => {
    hydrate();
    const seen = localStorage.getItem("ntc:onboarded");
    if (!seen) {
      setShowOnboarding(true);
    } else if (seen === "granted" || seen === "1") {
      enableLocation();
    } else {
      setFallbackLocation();
    }
  }, [hydrate]);

  useEffect(() => {
    const id = setInterval(() => simulateTick(), 5000);
    return () => clearInterval(id);
  }, [simulateTick]);

  useEffect(
    () => () => {
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    },
    [],
  );

  // Online/offline detection
  useEffect(() => {
    const addToast = useGame.getState().addToast;
    const handleOnline = () => addToast('success', '📶 Back online — syncing...');
    const handleOffline = () => addToast('warning', '📴 You are offline — moves will be queued');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Keyboard listeners for virtual movement (ONLY when GPS is NOT active)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gpsActiveRef.current) return; // Block WASD when real GPS is active
      setKeys((prev) => new Set(prev).add(e.key.toLowerCase()));
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys((prev) => {
        const next = new Set(prev);
        next.delete(e.key.toLowerCase());
        return next;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Virtual movement loop (WASD — only in fallback/skipped mode, blocked when GPS is on)
  useEffect(() => {
    if (keys.size === 0) return;
    if (gpsActiveRef.current) return;
    
    let lastTime = performance.now();
    let frameId: number;
    let lastClaimTime = Date.now();

    const loop = (time: number) => {
      if (gpsActiveRef.current) {
        // GPS came on while WASD was active — stop
        return;
      }
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (dt > 0 && dt < 0.5) {
        const pos = useGame.getState().position;
        if (pos) {
          let dx = 0;
          let dy = 0;
          const speed = 0.0003;

          if (keys.has('w') || keys.has('arrowup')) dy += speed * dt;
          if (keys.has('s') || keys.has('arrowdown')) dy -= speed * dt;
          if (keys.has('a') || keys.has('arrowleft')) dx -= speed * dt;
          if (keys.has('d') || keys.has('arrowright')) dx += speed * dt;

          if (dx !== 0 || dy !== 0) {
            const newPos = { ...pos, lng: pos.lng + dx, lat: pos.lat + dy, accuracy: 10 };
            setPosition(newPos);
            const now = Date.now();
            if (now - lastClaimTime > 1000) {
              claimCurrentPosition(newPos);
              lastClaimTime = now;
            }
          }
        }
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [keys, setPosition, claimCurrentPosition]);

  const setFallbackLocation = () => {
    gpsActiveRef.current = false;
    const fallback = { lng: 85.324, lat: 27.7172, accuracy: 10 }; // Kathmandu
    setPosition(fallback);
    // Also clear trail so no stale trail lines show
    useGame.setState({ movementTrail: [] });
    const flyToFallback = () => {
      const map = getMap();
      if (map) {
        map.flyTo({ center: [fallback.lng, fallback.lat], zoom: 16, duration: 1800 });
      } else {
        setTimeout(flyToFallback, 500);
      }
    };
    flyToFallback();
  };

  const enableLocation = () => {
    localStorage.setItem("ntc:onboarded", "granted");
    setShowOnboarding(false);
    if (!("geolocation" in navigator)) {
      setFallbackLocation();
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    // Get an immediate position fix before watchPosition fires
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gpsActiveRef.current = true;
        const coords = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
        };
        setPosition(coords);
        // Clear any stale WASD trail
        useGame.setState({ movementTrail: [] });
        const map = getMap();
        if (map) {
          map.flyTo({ center: [coords.lng, coords.lat], zoom: 16, pitch: 0, duration: 1800 });
        }
        // Accuracy feedback
        if (coords.accuracy && coords.accuracy > 500) {
          useGame.getState().addToast('warning', `📍 GPS accuracy: ~${Math.round(coords.accuracy)}m — location may be approximate`);
        } else {
          useGame.getState().addToast('success', `📍 GPS locked — accuracy: ~${Math.round(coords.accuracy || 0)}m`);
        }
      },
      (err) => {
        console.warn("GPS getCurrentPosition error:", err);
        // Show fallback toast
        useGame.getState().addToast('info', '📍 Using Kathmandu as default — enable GPS for your location');
        setFallbackLocation();
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastGpsRef.current < 1500) return;
        lastGpsRef.current = now;

        gpsActiveRef.current = true;
        const coords = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
        };

        setPosition(coords);
        claimCurrentPosition(coords);

        const map = getMap();
        if (map && map.getZoom() < 13) {
          map.flyTo({ center: [coords.lng, coords.lat], zoom: 16, pitch: 0, duration: 1800 });
        }
      },
      (err) => {
        console.warn("GPS watch error:", err);
        if (err.code === err.PERMISSION_DENIED || err.code === err.POSITION_UNAVAILABLE) {
          setFallbackLocation();
          localStorage.setItem("ntc:onboarded", "skipped");
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  };

  const skipLocation = () => {
    localStorage.setItem("ntc:onboarded", "skipped");
    setShowOnboarding(false);
    setFallbackLocation();
  };

  if (!user) return null;

  return (
    <div
      className="relative h-[100dvh] min-h-[100svh] w-[100dvw] overflow-hidden bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <GameMap />

      <TopBar onMenu={() => setMenuOpen(true)} />
      <Leaderboard />
      <ActionFabric />
      <TerritoryInspector />
      <ToastContainer />
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />

      {showOnboarding && <OnboardingModal onAllow={enableLocation} onSkip={skipLocation} />}
    </div>
  );
}
