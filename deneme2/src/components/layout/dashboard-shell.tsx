"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

/** Holds the mobile drawer state shared by the header button and the sidebar. */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Header onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-surface-2">{children}</main>
      </div>
    </div>
  );
}
