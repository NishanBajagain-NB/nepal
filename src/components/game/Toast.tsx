import { X } from "lucide-react";
import { useGame, type GameToast } from "@/lib/game/store";

const TYPE_STYLES: Record<GameToast["type"], string> = {
  info: "border-cyan/40 bg-cyan/10",
  success: "border-volt/40 bg-volt/10",
  warning: "border-amber/40 bg-amber/10",
};

const TYPE_ICONS: Record<GameToast["type"], string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
};

export function ToastContainer() {
  const toasts = useGame((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: GameToast }) {
  const dismiss = useGame((s) => s.dismissToast);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 shadow-xl backdrop-blur-md animate-in slide-in-from-top-2 fade-in duration-300 ${TYPE_STYLES[toast.type]}`}
    >
      <span className="text-base">{TYPE_ICONS[toast.type]}</span>
      <span className="text-sm font-medium">{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg hover:bg-foreground/10"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
