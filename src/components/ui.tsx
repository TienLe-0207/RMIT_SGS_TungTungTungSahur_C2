"use client";

import type { ReactNode } from "react";
import { persona } from "@/lib/client/persona";
import { useMe } from "@/lib/client/hooks";

type Tone = "ok" | "warn" | "danger" | "info" | "gold" | undefined;

export function Card({ title, sub, aside, tone, children }: { title?: ReactNode; sub?: ReactNode; aside?: ReactNode; tone?: "danger" | "gold"; children?: ReactNode }) {
  return (
    <section className={`card ${tone ?? ""}`}>
      {(title || aside) && (
        <header>
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="sub">{sub}</p>}
          </div>
          <span className="spacer" />
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
}

export function Button({
  variant, big, busy, disabled, onClick, children, title,
}: {
  variant?: "primary" | "danger" | "ghost";
  big?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button className={`btn ${variant ?? ""} ${big ? "big" : ""}`} disabled={disabled || busy} onClick={onClick} title={title}>
      {busy && <span className="spinner" />}
      {children}
    </button>
  );
}

export function Notice({ tone, title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={`notice ${tone ?? ""}`} role={tone === "danger" ? "alert" : undefined}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function Cipher({ text, max = 220 }: { text: string; max?: number }) {
  return (
    <div className="cipher" title={`${text.length} characters`}>
      {text.length > max ? `${text.slice(0, max)}…` : text}
    </div>
  );
}

export type StepState = "done" | "active" | "todo" | "blocked";
export function Stepper({ steps }: { steps: { label: string; state: StepState; note?: ReactNode }[] }) {
  return (
    <div className="stepper">
      {steps.map((s) => (
        <div key={s.label} className={`step ${s.state}`}>
          <div className="bar" />
          <div className="label">{s.label}</div>
          {s.note && <div className="note">{s.note}</div>}
        </div>
      ))}
    </div>
  );
}

// The service's own mark: a sealed paper inside a stamp ring. Deliberately not a state emblem.
export function Emblem({ size = 52 }: { size?: number }) {
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 52 52" role="img" aria-label="SealedExam emblem">
      <circle cx="26" cy="26" r="24" fill="#fff" stroke="#1d3f73" strokeWidth="3" />
      <circle cx="26" cy="26" r="19" fill="none" stroke="#1d3f73" strokeWidth="1" />
      <rect x="16" y="13" width="20" height="25" fill="#fff" stroke="#0b0c0c" strokeWidth="1.6" />
      <path d="M19 19h14M19 23h14M19 27h9" stroke="#0b0c0c" strokeWidth="1.4" />
      <circle cx="32" cy="34" r="6" fill="#b3261e" />
      <path d="M29.5 34l1.8 1.8 3.4-3.6" fill="none" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

export function PersonaChip({ username, showTitle = true }: { username: string; showTitle?: boolean }) {
  const p = persona(username);
  return (
    <span className="persona-chip">
      <span className="dot" style={{ background: p.color }}>{p.name.slice(0, 1)}</span>
      <span>
        {p.name}
        {showTitle && p.title && <small> ({p.title})</small>}
      </span>
    </span>
  );
}

export function PageHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}

export const time = (iso: string | number | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

/**
 * Page gate. UI only: it decides what to show, never what is allowed. The API routes check the
 * same roles on the server, and the Tide network checks them again on every decrypt.
 */
export function Gate({ allow, who, children }: { allow: (r: ReturnType<typeof useMe>["roles"]) => boolean; who: string; children: ReactNode }) {
  const { tc, roles } = useMe();
  if (tc.isInitializing) return <p className="muted">Connecting to Tide…</p>;
  if (!tc.authenticated) {
    return (
      <Card title="Sign in required" sub="Each persona signs in with Tide in its own browser profile.">
        <Button variant="primary" onClick={() => tc.login()}>Sign in with Tide</Button>
      </Card>
    );
  }
  if (!allow(roles)) {
    return (
      <Notice tone="warn" title={`This page is for ${who}.`}>
        Hiding it here is a convenience. The server refuses these calls without the role, and the Tide network refuses decryption.
      </Notice>
    );
  }
  return <>{children}</>;
}
