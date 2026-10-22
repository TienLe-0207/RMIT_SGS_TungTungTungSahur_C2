"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMe } from "@/lib/client/hooks";
import { persona } from "@/lib/client/persona";
import { Badge, Button, PersonaChip } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const { tc, username, roles } = useMe();
  const path = usePathname();
  const signedIn = tc.authenticated;

  // Nav follows the token's roles. Convenience only; the server and the network enforce.
  const links = [
    { href: "/", label: "Home", show: true },
    { href: "/setter", label: "Seal questions", show: roles.setter },
    { href: "/room", label: "Exam room", show: roles.proctor },
    { href: "/council", label: "Council", show: roles.council },
    { href: "/operator", label: "Operator view", show: roles.council || roles.operator },
    { href: "/audit", label: "Audit trail", show: signedIn },
  ].filter((l) => l.show);

  const roleBadges = [
    roles.council && "council",
    roles.setter && "exam-setter",
    roles.proctor && "proctor",
    roles.operator && "it-operator",
    roles.releaser && "exam-releaser",
  ].filter(Boolean) as string[];

  return (
    <div style={{ ["--persona" as any]: signedIn ? persona(username).color : "var(--gold)" }}>
      <div className="topbar">
        <Link href="/" className="brand">
          <span className="seal-mark">✦</span> SealedExam
        </Link>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="who">
          {signedIn ? (
            <>
              {roleBadges.map((r) => (
                <Badge key={r} tone={r === "exam-releaser" ? "ok" : r === "council" ? "gold" : undefined}>{r}</Badge>
              ))}
              <PersonaChip username={username} showTitle={false} />
              <Button variant="ghost" onClick={() => tc.logout()}>Sign out</Button>
            </>
          ) : (
            !tc.isInitializing && <Button variant="primary" onClick={() => tc.login()}>Sign in with Tide</Button>
          )}
        </div>
      </div>
      <main>{children}</main>
    </div>
  );
}
