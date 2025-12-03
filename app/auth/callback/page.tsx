"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Wait a moment for Supabase to process the hash
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Check if there's a session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          // Session exists, redirect to social-network
          router.push("/");
        } else {
          // No session, redirect to home
          console.log("No session found after OAuth callback");
          router.push("/");
        }
      } catch (error) {
        console.error("Error handling auth callback:", error);
        router.push("/");
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid #d1d5db",
            borderTopColor: "#111827",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 16px",
          }}
        ></div>
        <p style={{ color: "#4b5563" }}>Signing you in...</p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
