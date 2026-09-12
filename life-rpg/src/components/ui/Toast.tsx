"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "default" | "success" | "danger" | "gold" | "info";

export interface ToastInput {
  title: string;
  body?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastInput, "body">> {
  id: number;
  body?: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastVariant, string> = {
  default: "⚜",
  success: "✓",
  danger: "!",
  gold: "🪙",
  info: "i",
};

const COLORS: Record<ToastVariant, string> = {
  default: "var(--gold)",
  success: "var(--success)",
  danger: "var(--danger)",
  gold: "var(--gold-2)",
  info: "var(--info)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++idRef.current;
      const item: ToastItem = {
        id,
        title: input.title,
        body: input.body,
        variant: input.variant ?? "default",
        duration: input.duration ?? 4500,
      };
      setToasts((list) => [...list.slice(-3), item]);
      window.setTimeout(() => dismiss(id), item.duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="panel pointer-events-auto flex w-full max-w-sm items-start gap-3 px-4 py-3"
              style={{ borderLeft: `3px solid ${COLORS[t.variant]}` }}
            >
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-black"
                style={{ background: COLORS[t.variant], color: "var(--gold-ink)" }}
              >
                {ICONS[t.variant]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-tight">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs text-muted">{t.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-mr-1 rounded-md px-1.5 text-muted hover:text-ink"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
