"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { CLASSES, isClassKey } from "@/lib/game";
export function useResource<T>(url: string) {
  const [snapshot, setSnapshot] = useState<{
    url: string;
    data: T | null;
    error: string;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    api<T>(url, { signal: c.signal })
      .then((data) => {
        if (active) setSnapshot({ url, data, error: "" });
      })
      .catch((e) => {
        if (active) setSnapshot({ url, data: null, error: e.message });
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [url, version]);
  useEffect(() => {
    const focus = () => reload();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload]);
  const current = snapshot?.url === url ? snapshot : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    loading: !current,
    reload,
  };
}
export function useDebounced(value: string, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
export function Avatar({
  name,
  classKey = "knight",
  large = false,
}: {
  name: string;
  classKey?: string;
  large?: boolean;
}) {
  const icon = isClassKey(classKey) ? CLASSES[classKey].icon : "⚔";
  return (
    <span
      className={`w-avatar ${large ? "w-avatar-lg" : ""}`}
      role="img"
      aria-label={`${name}, ${classKey}`}
    >
      <span aria-hidden="true">{icon}</span>
    </span>
  );
}
export function HeroLink({
  id,
  name,
  classKey,
  subtitle,
}: {
  id: number;
  name: string;
  classKey: string;
  subtitle?: string;
}) {
  return (
    <Link className="w-hero-link" href={`/heroes/${id}`}>
      <Avatar name={name} classKey={classKey} />
      <span>
        <strong>{name}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </Link>
  );
}
export function Empty({
  icon = "✧",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-empty">
      <span aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="w-loading" role="status" aria-label="Loading the hall">
      <span />
      <span />
      <span />
      <p>Opening the guild ledger…</p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className="w-error" role="alert">
      <p>{error}</p>
      <button className="w-btn" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function Pager({
  page,
  more,
  onChange,
}: {
  page: number;
  more: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <nav className="w-pager" aria-label="Pagination">
      <button
        className="w-btn"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        ← Previous
      </button>
      <span>Page {page + 1}</span>
      <button
        className="w-btn"
        disabled={!more}
        onClick={() => onChange(page + 1)}
      >
        Next →
      </button>
    </nav>
  );
}
export function Meter({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const percent = Math.min(100, Math.max(0, (value / Math.max(1, max)) * 100));
  return (
    <div
      className="w-meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
export function HallIllustration() {
  return (
    <svg
      className="w-hall-art"
      viewBox="0 0 540 275"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 235H534M27 252H508M82 269H466"
        stroke="#b6bb9e"
        strokeDasharray="4 8"
      />
      <circle cx="405" cy="67" r="42" fill="#edd78b" />
      <path
        d="M26 222L67 132L97 183L137 120L184 209L238 115L276 185L318 119L368 212L428 153L491 224"
        stroke="#acb697"
        fill="#dce0c6"
      />
      <path
        d="M119 229V117H158V89H171V107H183V89H196V107H208V89H221V116H258V229"
        fill="#c2c9a9"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path
        d="M121 139H258M126 159H149M229 168H253M128 194H152M204 191H249M127 216H159"
        stroke="#899575"
      />
      <path d="M166 229V191Q185 163 205 191V229" fill="#405a43" />
      <path
        d="M268 229V101H401V229Z"
        fill="#ece7ce"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path
        d="M249 103L334 43L420 103Z"
        fill="#536b4b"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path d="M263 96H405M281 83H385M301 68H363" stroke="#91a279" />
      <path
        d="M327 43V14H369L359 25L369 36H328"
        fill="#b96639"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path
        d="M302 229V183Q334 147 366 183V229"
        fill="#9a6741"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path d="M334 168V229M311 188V227M357 188V227" stroke="#694f34" />
      <circle cx="326" cy="207" r="2" fill="#e3c483" />
      <circle cx="341" cy="207" r="2" fill="#e3c483" />
      <path d="M289 132V118H307V132ZM360 132V118H378V132Z" fill="#405a43" />
      <path
        d="M268 153H399M278 160H292M375 172H398M273 200H293M375 210H398"
        stroke="#bdbaa2"
      />
      <path
        d="M324 130L334 118L344 130L334 144Z"
        fill="#b96639"
        stroke="#344d3b"
      />
      <path
        d="M91 230V146H109V131H123V145H140V229M388 229V148H405V130H420V148H439V229"
        fill="#c7cfaf"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path d="M111 176V162M415 179V164" stroke="#405a43" strokeWidth="8" />
      <path
        d="M67 232V202M52 215L67 169L83 215ZM451 234V199M434 216L452 159L470 216Z"
        fill="#6d8156"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path
        d="M178 249L197 230H307L321 249M358 242L371 230H436L451 242"
        fill="#d3c9a8"
      />
      <path
        d="M42 62L48 66L55 62M90 42L97 46L104 42M214 51L221 55L228 51"
        stroke="#6f795d"
        strokeWidth="2"
      />
      <path
        d="M255 229V192M253 199H235V214H252"
        stroke="#344d3b"
        strokeWidth="2"
      />
      <path d="M237 201H250V212H237Z" fill="#e0b064" />
    </svg>
  );
}
