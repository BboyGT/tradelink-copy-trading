"use client";

import { useState, useMemo } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useNavStore } from "@/lib/nav-store";
import { cn } from "@/lib/utils";

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

// Password strength calculator
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };

  let score = 0;
  // Length - start at 1 if any password exists
  if (password.length >= 1) score = 1; // minimum "very weak"
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  // Character variety
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++; // mixed case
  if (/[0-9]/.test(password)) score++; // has numbers
  if (/[^a-zA-Z0-9]/.test(password)) score++; // has special chars
  // Deductions (but never below 1)
  if (/(.)\1{2,}/.test(password)) score--; // repeated chars (aaa, 111)
  if (password.length < 6) score = 1; // too short = always very weak

  score = Math.max(1, Math.min(5, score));

  const levels = [
    { score: 0, label: "", color: "" },
    { score: 1, label: "Very weak", color: "bg-loss" },
    { score: 2, label: "Weak", color: "bg-loss" },
    { score: 3, label: "Fair", color: "bg-warning" },
    { score: 4, label: "Good", color: "bg-info" },
    { score: 5, label: "Strong", color: "bg-profit" },
  ];

  return levels[score];
}

function PasswordStrengthBar({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  if (!password) return null;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= strength.score ? strength.color : "bg-white/5",
            )}
          />
        ))}
      </div>
      {strength.label && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {strength.label}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {password.length} chars
          </span>
        </div>
      )}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  showStrength,
  minLength = 1,
  maxLength = 128,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  showStrength?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          type={showPassword ? "text" : "password"}
          required
          minLength={minLength}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={showPassword ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {showStrength && <PasswordStrengthBar password={value} />}
    </div>
  );
}

export function AuthDialog() {
  const router = useRouter();
  const open = useNavStore((s) => s.authOpen);
  const setOpen = useNavStore((s) => s.setAuthOpen);
  const setView = useNavStore((s) => s.setView);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await withTimeout(fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
          signal: AbortSignal.timeout(20_000),
        }), 25_000, "Sign-up timed out. If you already submitted this email, try signing in.");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) throw new Error("An account may already exist with this email. Try the Sign in tab.");
          throw new Error(data.error ?? "Registration failed");
        }
      }
      const result = await withTimeout(
        signIn("credentials", { email, password, redirect: false }),
        20_000,
        "Sign-in timed out. Please try again.",
      );
      if (!result || result.error) {
        throw new Error("Invalid credentials");
      }
      toast({ title: "Signed in", description: "Welcome to TRADE LINK" });
      setOpen(false);
      setView("dashboard");
      router.replace("/");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["session"] });
    } catch (err: any) {
      toast({
        title: "Authentication failed",
        description: err.name === "TimeoutError" || err.name === "AbortError"
          ? "The request timed out. If you were signing up, try signing in before submitting again."
          : err.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md rm-glass-gold">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-tight">TRADE LINK</DialogTitle>
          <DialogDescription className="font-mono text-[11px] uppercase tracking-wider">
            Sign in to access your terminal
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Sign in</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
          <TabsContent value="login">
            <form onSubmit={submit} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="login-pass">Password</Label>
                <PasswordInput id="login-pass" value={password} onChange={setPassword} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                New here? Register to create an account, then connect your broker accounts.
              </p>
            </form>
          </TabsContent>
          <TabsContent value="register">
            <form onSubmit={submit} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="reg-name">Name</Label>
                <Input id="reg-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-email">Email</Label>
                <Input id="reg-email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-pass">Password</Label>
                <PasswordInput id="reg-pass" value={password} onChange={setPassword} showStrength minLength={12} maxLength={128} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
