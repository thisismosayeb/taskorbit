"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, useLocale} from "@/lib/i18n";

type ToastKind = "success" | "error";

type ToastItem = { id: number; kind: ToastKind; message: string };

const ToastContext = React.createContext<{ toast: (message: string, kind?: ToastKind) => void }>({
  toast: () => {},
});

export function useToast() {
  return React.useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  useLocale();
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((message: string, kind: ToastKind = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((toastItem) => (
          <div
            key={toastItem.id}
            role="status"
            className={cn(
              "toast-enter pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg",
              toastItem.kind === "success" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900",
            )}
          >
            {toastItem.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            )}
            <span className="flex-1">{toastItem.message}</span>
            <button
              type="button"
              aria-label={t("ui.dismissNotification")}
              className="rounded p-0.5 hover:bg-black/5"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toastItem.id))}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
