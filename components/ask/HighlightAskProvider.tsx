"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AskContextBundle,
  AskScopeId,
  AskScopeRegistration,
  CompileAskContextInput,
  RawPlacedBuilding,
} from "@/lib/askContext";
import { compileAskContext } from "@/lib/askContext";
import AskPopover from "./AskPopover";

export interface GetPageStateResult {
  rawBuildings: RawPlacedBuilding[];
  trafficImpactResult?: CompileAskContextInput["trafficImpactResult"];
  stakeholderAnalysis?: CompileAskContextInput["stakeholderAnalysis"];
  shadowResults?: CompileAskContextInput["shadowResults"];
  reasonablenessLatest?: CompileAskContextInput["reasonablenessLatest"];
  competitorState?: CompileAskContextInput["competitorState"];
  fallbackAnchor?: CompileAskContextInput["fallbackAnchor"];
}

interface AskScopeContextValue {
  registerScope: (registration: AskScopeRegistration) => void;
  unregisterScope: (id: AskScopeId) => void;
}

const AskScopeContext = createContext<AskScopeContextValue | null>(null);

interface PendingSelection {
  rect: DOMRect;
  selectedText: string;
  scope: AskScopeRegistration;
}

interface OpenSession {
  anchorRect: DOMRect;
  initialContext: AskContextBundle;
  scope: AskScopeRegistration;
  selectedText: string;
}

interface HighlightAskProviderProps {
  getPageState: () => GetPageStateResult;
  children: React.ReactNode;
}

export function HighlightAskProvider({ getPageState, children }: HighlightAskProviderProps) {
  const scopeRegistry = useRef(new Map<AskScopeId, AskScopeRegistration>());

  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  const registerScope = useCallback((registration: AskScopeRegistration) => {
    scopeRegistry.current.set(registration.id, registration);
  }, []);
  const unregisterScope = useCallback((id: AskScopeId) => {
    scopeRegistry.current.delete(id);
  }, []);

  const value = useMemo<AskScopeContextValue>(
    () => ({ registerScope, unregisterScope }),
    [registerScope, unregisterScope],
  );

  useEffect(() => {
    function onMouseUp() {
      // Defer to let the browser finalize the selection (esp. on dbl-click).
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setPending(null);
          return;
        }
        const text = sel.toString().trim();
        if (text.length < 3) {
          setPending(null);
          return;
        }
        const anchorNode = sel.anchorNode;
        const anchorEl =
          anchorNode?.nodeType === Node.ELEMENT_NODE
            ? (anchorNode as Element)
            : anchorNode?.parentElement ?? null;
        const scopeEl = anchorEl?.closest("[data-ask-scope]") as HTMLElement | null;
        if (!scopeEl) {
          setPending(null);
          return;
        }
        const id = (scopeEl.dataset.askScope ?? "generic") as AskScopeId;
        const title = scopeEl.dataset.askTitle ?? "Panel";
        const registered = scopeRegistry.current.get(id);
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setPending(null);
          return;
        }
        setPending({
          rect,
          selectedText: text,
          scope: registered ?? { id, title, data: {} },
        });
      }, 0);
    }

    function onDocumentMouseDown(e: MouseEvent) {
      // If the user starts a new mousedown not on the chip, drop the pending chip.
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-ask-chip]")) return;
      if (target?.closest("[data-ask-popover]")) return;
      setPending(null);
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, []);

  const handleOpen = useCallback(
    async (p: PendingSelection) => {
      setIsCompiling(true);
      try {
        const page = getPageState();
        const ctx = await compileAskContext({
          scope: p.scope,
          selectedText: p.selectedText,
          rawBuildings: page.rawBuildings,
          registeredScopes: Array.from(scopeRegistry.current.values()),
          trafficImpactResult: page.trafficImpactResult,
          stakeholderAnalysis: page.stakeholderAnalysis,
          shadowResults: page.shadowResults,
          reasonablenessLatest: page.reasonablenessLatest,
          competitorState: page.competitorState,
          fallbackAnchor: page.fallbackAnchor,
        });
        setOpenSession({
          anchorRect: p.rect,
          initialContext: ctx,
          scope: p.scope,
          selectedText: p.selectedText,
        });
        setPending(null);
        // Drop browser selection so the chip doesn't re-appear after popover closes.
        window.getSelection()?.removeAllRanges();
      } finally {
        setIsCompiling(false);
      }
    },
    [getPageState],
  );

  const recompile = useCallback(async (): Promise<AskContextBundle | null> => {
    if (!openSession) return null;
    const page = getPageState();
    return compileAskContext({
      scope: openSession.scope,
      selectedText: openSession.selectedText,
      rawBuildings: page.rawBuildings,
      registeredScopes: Array.from(scopeRegistry.current.values()),
      trafficImpactResult: page.trafficImpactResult,
      stakeholderAnalysis: page.stakeholderAnalysis,
      shadowResults: page.shadowResults,
      reasonablenessLatest: page.reasonablenessLatest,
      competitorState: page.competitorState,
      fallbackAnchor: page.fallbackAnchor,
    });
  }, [openSession, getPageState]);

  return (
    <AskScopeContext.Provider value={value}>
      {children}
      {pending && !openSession && (
        <AskChip
          rect={pending.rect}
          loading={isCompiling}
          onClick={() => handleOpen(pending)}
        />
      )}
      {openSession && (
        <AskPopover
          anchorRect={openSession.anchorRect}
          context={openSession.initialContext}
          selectedText={openSession.selectedText}
          recompileContext={recompile}
          onClose={() => setOpenSession(null)}
        />
      )}
    </AskScopeContext.Provider>
  );
}

interface AskChipProps {
  rect: DOMRect;
  loading: boolean;
  onClick: () => void;
}

function AskChip({ rect, loading, onClick }: AskChipProps) {
  // Position above the selection by default; flip below if too close to top.
  const top = rect.top < 60 ? rect.bottom + 8 : rect.top - 36;
  const left = Math.min(window.innerWidth - 180, Math.max(8, rect.left));
  return (
    <button
      data-ask-chip
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{ position: "fixed", top, left, zIndex: 9999 }}
      className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 text-white text-[11px] font-bold shadow-lg hover:bg-slate-800 transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 8v4M12 16h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      {loading ? "Loading…" : "Ask something"}
    </button>
  );
}

// ─── Hook for panels to register their displayed data ───────────────────────

export function useAskScopeData(registration: AskScopeRegistration | null): void {
  const ctx = useContext(AskScopeContext);
  // We intentionally serialize the data so deep-equal callers don't re-register on every render.
  const serialized = registration ? JSON.stringify(registration.data) : "";
  useEffect(() => {
    if (!ctx || !registration) return;
    ctx.registerScope(registration);
    return () => {
      ctx.unregisterScope(registration.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, registration?.id, registration?.title, serialized]);
}
