"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <a
      href="#"
      onClick={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      {busy ? "…" : "Log out"}
    </a>
  );
}
