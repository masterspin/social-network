"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

export default function AuthForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred during sign in",
      );
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="text-sm leading-6">{error}</span>
        </div>
      )}

      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="mx-auto flex w-auto items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
      >
        {loading ? (
          <>
            <Spinner
              size="sm"
              className="border-white/30 border-t-white dark:border-slate-950/30 dark:border-t-slate-950"
            />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.655 32.659 29.355 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.967 3.042l5.657-5.657C34.03 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.83 12 24 12c3.059 0 5.842 1.154 7.967 3.042l5.657-5.657C34.03 6.053 29.268 4 24 4c-7.682 0-14.35 4.344-17.694 10.691z"/>
              <path fill="#4CAF50" d="M24 44c5.184 0 9.91-1.984 13.454-5.219l-6.206-5.238C29.173 35.091 26.74 36 24 36c-5.34 0-9.624-3.322-11.29-7.956l-6.522 5.025C9.472 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.03 12.03 0 01-4.055 5.543l.003-.002 6.206 5.238C36.966 36.119 44 30 44 24c0-1.341-.138-2.651-.389-3.917z"/>
            </svg>
            <span>Continue with Google</span>
          </>
        )}
      </button>
    </div>
  );
}
