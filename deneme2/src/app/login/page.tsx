"use client";

import { useState } from "react";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.href = next;
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Giriş başarısız");
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-ink">UI Benchmark Hub</h1>
        <p className="mt-1 text-sm text-muted">Devam etmek için giriş yapın.</p>

        <label className="mt-6 block text-sm font-medium text-ink-2">
          Kullanıcı
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            autoFocus
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm outline-none focus:border-line-strong"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-ink-2">
          Şifre
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm outline-none focus:border-line-strong"
          />
        </label>

        {error && <p className="mt-4 text-sm text-rose">{error}</p>}

        <button
          type="submit"
          disabled={busy || !user || !password}
          className="mt-6 w-full rounded-lg bg-surface px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Kontrol ediliyor…" : "Giriş yap"}
        </button>
      </form>
    </div>
  );
}
