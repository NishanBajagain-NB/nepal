import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Heart, Search } from "lucide-react";
import { useGame } from "@/lib/game/store";
import { TERRITORY_HEX, type TerritoryColor } from "@/lib/game/types";
import { DEFAULT_EMOJIS, searchEmoji } from "@/lib/emoji-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nepal Territory Conquest — Claim Your Ground" },
      {
        name: "description",
        content:
          "A geolocation-based territory conquest game across all of Nepal. Walk into zones, conquer them, defend your color.",
      },
      { property: "og:title", content: "Nepal Territory Conquest" },
      { property: "og:description", content: "Claim Nepal one zone at a time." },
    ],
  }),
  component: AuthScreen,
});

const COLORS: TerritoryColor[] = ["crimson", "cyan", "volt", "magenta", "amber", "violet"];
const USERNAME_RE = /^[A-Za-z0-9_]{3,12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

function AuthScreen() {
  const navigate = useNavigate();
  const user = useGame((s) => s.user);
  const loginAction = useGame((s) => s.login);
  const registerAction = useGame((s) => s.register);

  const [mode, setMode] = useState<"login" | "register">("register");
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; username?: string }>(
    {},
  );

  // Step 2
  const [username, setUsername] = useState("");
  const [emoji, setEmoji] = useState<string>(DEFAULT_EMOJIS[0]);
  const [color, setColor] = useState<TerritoryColor>(() => randomColor());
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (user) navigate({ to: "/play" });
  }, [user, navigate]);

  const pwStrength = useMemo(() => {
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) s++;
    return s; // 0..4
  }, [password]);

  const validateStep1 = () => {
    const e: typeof errors = {};
    if (!EMAIL_RE.test(email)) e.email = "Enter a valid email.";
    if (password.length < 6) e.password = "At least 6 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submitLogin = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validateStep1()) return;
    const res = await loginAction(email, password);
    if (!res.ok) {
      if (res.errors) {
        setErrors(res.errors);
      } else if (res.error) {
        setErrors({ email: res.error });
      } else {
        setErrors({ email: "Login failed." });
      }
    }
  };

  const goToStep2 = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validateStep1()) return;
    setStep(2);
  };

  const finishSignup = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: typeof errors = {};
    if (!USERNAME_RE.test(username)) e.username = "3–12 chars, letters / numbers / underscore.";
    setErrors(e);
    if (Object.keys(e).length) return;

    const res = await registerAction({
      email,
      password,
      username,
      emoji,
      color,
    });
    if (!res.ok) {
      if (res.errors) {
        setErrors(res.errors);
        if (res.errors.email || res.errors.password) {
          setStep(1);
        }
      } else if (res.error) {
        setErrors({ username: res.error });
      } else {
        setErrors({ username: "Registration failed." });
      }
    }
  };

  const emojiResults = useMemo(() => searchEmoji(query, 80), [query]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <BackdropGrid />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
        <header className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-background font-mono text-sm font-bold">
            N
          </div>
          <span className="text-sm font-semibold uppercase tracking-[0.2em]">
            Nepal · Territory
          </span>
        </header>

        {mode === "register" && step === 1 && (
          <div className="mt-10">
            <h1 className="text-4xl font-bold tracking-tight leading-[1.05]">
              Claim every
              <br />
              <span className="text-cyan">100m</span> of Nepal.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Walk into a zone. Paint it your color. Hold it against everyone else.
            </p>
          </div>
        )}

        {mode === "register" && step === 2 && (
          <div className="mt-10">
            <h1 className="text-3xl font-bold tracking-tight leading-[1.05]">
              Pick your <span className="text-cyan">identity</span>.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your emoji and color will appear on every zone you own.
            </p>
          </div>
        )}

        <form
          onSubmit={mode === "login" ? submitLogin : step === 1 ? goToStep2 : finishSignup}
          className="mt-8 glass-panel rounded-3xl p-5 shadow-2xl"
        >
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl bg-foreground/5 p-1 text-xs font-semibold uppercase tracking-widest">
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setStep(1);
                setErrors({});
              }}
              className={`flex-1 rounded-lg py-2 transition ${mode === "register" ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setStep(1);
                setErrors({});
              }}
              className={`flex-1 rounded-lg py-2 transition ${mode === "login" ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              Log in
            </button>
          </div>

          {/* Progress dots for signup */}
          {mode === "register" && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Dot active={step === 1} done={step === 2} label="Account" />
              <div className="h-px w-8 bg-border" />
              <Dot active={step === 2} label="Identity" />
            </div>
          )}

          {/* STEP 1 / LOGIN */}
          {step === 1 && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
              <Field label="Email" error={errors.email}>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gorkha.np"
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
              </Field>
              <Field label="Password" error={errors.password}>
                <div className="flex items-center gap-2">
                  <input
                    type={showPw ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="grid h-7 w-7 place-items-center rounded-lg hover:bg-foreground/10"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === "register" && password.length > 0 && (
                  <div className="mt-2 flex gap-1" aria-live="polite">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition ${
                          i < pwStrength
                            ? pwStrength === 1
                              ? "bg-crimson"
                              : pwStrength === 2
                                ? "bg-amber"
                                : pwStrength === 3
                                  ? "bg-volt"
                                  : "bg-cyan"
                            : "bg-foreground/10"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </Field>

              <button
                type="submit"
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold uppercase tracking-widest text-background hover:opacity-90 active:scale-[0.99] transition"
              >
                {mode === "login" ? (
                  "Resume conquest"
                ) : (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 2 — Identity */}
          {mode === "register" && step === 2 && (
            <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
              <Field label="Username" error={errors.username}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="snowleopard"
                  maxLength={12}
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
              </Field>

              {/* Selected preview */}
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/40 p-3">
                <div
                  className="grid h-14 w-14 place-items-center rounded-2xl text-3xl ring-2 transition"
                  style={{
                    background: TERRITORY_HEX[color] + "22",
                    boxShadow: `0 0 0 2px ${TERRITORY_HEX[color]}`,
                  }}
                >
                  {emoji}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your mark</div>
                  <div className="mt-0.5 text-xs font-semibold capitalize">{color} faction</div>
                  <div className="mt-2 flex gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`h-6 w-6 rounded-full border-2 transition-all ${
                          color === c
                            ? "scale-110 border-foreground shadow-lg"
                            : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                        style={{ background: TERRITORY_HEX[c] }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick picks */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Quick picks
                </div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {DEFAULT_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setEmoji(e);
                      }}
                      className={`aspect-square rounded-xl text-2xl transition ${
                        emoji === e
                          ? "bg-foreground text-background scale-105"
                          : "bg-foreground/5 hover:bg-foreground/10"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Or search any emoji
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="tiger, mountain, fire…"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div
                  className="mt-2 grid max-h-44 grid-cols-8 gap-1.5 overflow-y-auto rounded-xl border border-border bg-background/30 p-2"
                  style={{ contentVisibility: "auto" }}
                >
                  {emojiResults.length === 0 ? (
                    <div className="col-span-8 py-6 text-center text-xs text-muted-foreground">
                      No emoji matches “{query}”.
                    </div>
                  ) : (
                    emojiResults.map((e) => (
                      <button
                        key={e.c}
                        type="button"
                        onClick={() => setEmoji(e.c)}
                        className={`aspect-square rounded-lg text-lg transition ${
                          emoji === e.c
                            ? "bg-foreground text-background scale-105"
                            : "hover:bg-foreground/10"
                        }`}
                        title={e.k.split(" ")[0]}
                      >
                        {e.c}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold uppercase tracking-widest hover:bg-foreground/5"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="submit"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-semibold uppercase tracking-widest text-background hover:opacity-90 active:scale-[0.99] transition"
                >
                  Enter the map <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Secure auth · your progress is synced.
        </p>
        <Link
          to="/donate"
          className="mt-3 inline-flex items-center justify-center gap-1.5 self-center rounded-full border border-border/60 px-3 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground hover:bg-foreground/5"
        >
          <Heart className="h-3 w-3 text-crimson" /> Support the dev
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className={`block rounded-xl border bg-background/40 px-3 py-2 transition ${error ? "border-destructive" : "border-border"}`}
      >
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="mt-1">{children}</div>
      </label>
      {error && <p className="mt-1 px-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function Dot({ active, done, label }: { active: boolean; done?: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`h-2 w-2 rounded-full transition ${
          active ? "bg-foreground scale-125" : done ? "bg-foreground/60" : "bg-foreground/20"
        }`}
      />
      <span
        className={`text-[10px] uppercase tracking-widest ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </span>
    </div>
  );
}

function BackdropGrid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.35]"
      style={{
        backgroundImage:
          "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        color: "color-mix(in srgb, currentColor 6%, transparent)",
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
      }}
    />
  );
}
