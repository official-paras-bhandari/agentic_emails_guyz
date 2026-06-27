'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error || 'Login failed');
      return;
    }
    router.replace('/');
    router.refresh();
  };

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Agentic Outreach</h1>
          <p className="text-sm text-zinc-500">Sign in to your assigned test workspace</p>
        </div>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="w-full rounded-xl border bg-transparent px-4 py-3"
        />

        <label className="block">
          <span className="sr-only">Password</span>
          <div className="relative">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="w-full rounded-xl border bg-transparent px-4 py-3 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex items-center px-4 text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white dark:bg-white dark:text-black">
          Sign in
        </button>
      </form>
    </main>
  );
}
