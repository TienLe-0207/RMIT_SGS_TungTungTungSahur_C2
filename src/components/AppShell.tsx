"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMe } from "@/lib/client/hooks";
import { persona } from "@/lib/client/persona";
import { SIMULATED } from "@/lib/tide/mode";
import { Badge, Button, Emblem, PersonaChip } from "./ui";

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
    <div style={{ ["--persona" as any]: signedIn ? persona(username).color : "var(--brand-dark)" }}>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div className="official-strip">
        <div className="inner">
          <span className="flag" aria-hidden="true" />
          <span>Prototype for the RMIT hackathon. This is not an official government website.</span>
        </div>
      </div>

      <header className="topbar">
        <div className="inner">
          <Link href="/" className="brand">
            <Emblem />
            <span>
              <span className="agency">Exam paper security service</span>
              <span className="service">SealedExam</span>
            </span>
          </Link>
          <div className="who">
            {signedIn ? (
              <>
                <span className="small muted">Signed in as</span>
                <PersonaChip username={username} />
                {roleBadges.map((r) => (
                  <Badge key={r} tone={r === "exam-releaser" ? "ok" : r === "council" ? "info" : undefined}>{r}</Badge>
                ))}
                <Button variant="ghost" onClick={() => tc.logout()}>Sign out</Button>
              </>
            ) : (
              !tc.isInitializing && <Button variant="primary" onClick={() => tc.login()}>Sign in with Tide</Button>
            )}
          </div>
        </div>
      </header>

      <nav className="navbar" aria-label="Main">
        <div className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""} aria-current={path === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>
      </nav>

      {SIMULATED && (
        <div className="phase-banner">
          <div className="inner">
            <span className="sim-flag">Prototype</span>
            <span>
              TideCloak sign-in, roles, council approvals and Tide network checks are <strong>simulated</strong> in this build.
              The app's own server-side checks run unchanged.
            </span>
          </div>
        </div>
      )}

      <main id="main">{children}</main>

      <footer className="footer">
        <div className="inner">
          <div>
            <h3>SealedExam</h3>
            <p>
              Exam papers travel to exam sites early and encrypted. Nobody can open one alone: opening takes a council
              quorum, and every step is recorded.
            </p>
          </div>
          <div>
            <h3>Help</h3>
            <ul>
              <li><Link href="/audit">Audit trail</Link></li>
              <li><a href="https://tide.org" target="_blank" rel="noreferrer">About Tide</a></li>
            </ul>
          </div>
          <p className="legal small">
            All people, exam sites and questions are fictional. Not affiliated with any ministry or government agency.
          </p>
        </div>
      </footer>
    </div>
  );
}
