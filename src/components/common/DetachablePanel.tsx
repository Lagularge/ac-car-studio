import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box,
  ExternalLink,
  Eye,
  GripHorizontal,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PictureInPicture2,
  Sliders,
} from 'lucide-react';
import {
  ACCS_NAV_HISTORY_EVENT,
  ACCS_UNDO_REDO_EVENT,
  attachWindowShortcutListeners,
} from '../../utils/undoRedo';

export type DetachMode = 'docked' | 'floating' | 'popout';

interface DetachablePanelProps {
  panelId: string;
  title: string;
  subtitle?: string;
  /** Visual role badge: 'viewer3d' (3Dモデルビューワー) or 'settings' (設定部分) */
  role?: 'viewer3d' | 'settings';
  mode?: DetachMode;
  onModeChange?: (nextMode: DetachMode) => void;
  defaultFloatingBounds?: { x: number; y: number; width: number; height: number };
  popoutSize?: { width: number; height: number };
  /** ClassName applied when docked in its normal grid cell */
  dockedClassName?: string;
  /** Hide the internal header bar when docked (if the parent renders its own toolbar switches) */
  hideDockedHeader?: boolean;
  children: React.ReactNode;
}

function syncStylesToChildWindow(sourceDoc: Document, targetDoc: Document) {
  targetDoc.head.innerHTML = '';
  const titleEl = targetDoc.createElement('title');
  titleEl.textContent = sourceDoc.title;
  targetDoc.head.appendChild(titleEl);

  const nodes = sourceDoc.head.querySelectorAll('style, link[rel="stylesheet"]');
  nodes.forEach((node) => {
    targetDoc.head.appendChild(node.cloneNode(true));
  });

  targetDoc.documentElement.className = sourceDoc.documentElement.className;
  targetDoc.documentElement.style.fontSize = sourceDoc.documentElement.style.fontSize || '16px';
  targetDoc.body.className =
    'bg-[#0b0e14] text-slate-100 antialiased selection:bg-rose-500/30 overflow-hidden m-0 p-0';
}

/**
 * Universal Detachable Container for either:
 *  - 3D Model Viewer Only (`role="viewer3d"`)
 *  - Settings / Inspector Panel Only (`role="settings"`)
 *
 * Uses a persistent DOM host element (`hostEl`) with React Portal so switching between
 * `docked` <-> `floating` <-> `popout` NEVER unmounts the React tree or loses the Three.js WebGL context!
 */
export const DetachablePanel: React.FC<DetachablePanelProps> = ({
  panelId,
  title,
  subtitle,
  role = 'settings',
  mode: controlledMode,
  onModeChange,
  defaultFloatingBounds,
  popoutSize = { width: 580, height: 760 },
  dockedClassName = '',
  hideDockedHeader = false,
  children,
}) => {
  const [internalMode, setInternalMode] = useState<DetachMode>('docked');
  const mode = controlledMode ?? internalMode;

  const setMode = useCallback(
    (next: DetachMode) => {
      if (controlledMode === undefined) {
        setInternalMode(next);
      }
      onModeChange?.(next);
    },
    [controlledMode, onModeChange]
  );

  // Persistent DOM element that holds the React portal across docked / floating / popout transitions
  const [hostEl] = useState<HTMLDivElement>(() => {
    const el = document.createElement('div');
    el.className = 'w-full h-full flex-1 flex flex-col min-h-0 overflow-hidden';
    return el;
  });

  const dockedSlotRef = useRef<HTMLDivElement | null>(null);
  const floatingSlotRef = useRef<HTMLDivElement | null>(null);
  const popoutSlotRef = useRef<HTMLDivElement | null>(null);
  const popoutWinRef = useRef<Window | null>(null);
  const [popoutReadyTick, setPopoutReadyTick] = useState(0);

  // In-app floating window geometry
  const [bounds, setBounds] = useState(() => {
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 900;
    const is3d = role === 'viewer3d';
    const w = defaultFloatingBounds?.width ?? (is3d ? 620 : 480);
    const h =
      defaultFloatingBounds?.height ??
      Math.min(is3d ? 540 : 680, Math.max(380, winH - 130));
    return {
      x: defaultFloatingBounds?.x ?? (is3d ? 28 : Math.max(24, winW - w - 28)),
      y: defaultFloatingBounds?.y ?? 84,
      width: w,
      height: h,
    };
  });
  const [minimized, setMinimized] = useState(false);
  const [translucent, setTranslucent] = useState(false);

  // Manage OS Pop-out BrowserWindow lifecycle
  useEffect(() => {
    if (mode !== 'popout') {
      if (popoutWinRef.current && !popoutWinRef.current.closed) {
        popoutWinRef.current.close();
      }
      popoutWinRef.current = null;
      popoutSlotRef.current = null;
      return;
    }

    const features = `width=${popoutSize.width},height=${popoutSize.height},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
    const childWin = window.open('about:blank', `accs_popout_${panelId}`, features);
    if (!childWin) {
      setMode('floating');
      return;
    }

    popoutWinRef.current = childWin;
    syncStylesToChildWindow(window.document, childWin.document);
    childWin.document.title = `AC Car Studio — ${title}`;

    childWin.document.body.innerHTML = '';
    const wrapper = childWin.document.createElement('div');
    wrapper.className = 'w-screen h-screen flex flex-col bg-[#0b0e14] text-slate-100 text-xs overflow-hidden';

    // Top bar inside pop-out window
    const header = childWin.document.createElement('div');
    header.className =
      'flex items-center justify-between gap-2 px-3.5 py-2 bg-[#0c1018] border-b border-[#242e42] shrink-0';

    const leftInfo = childWin.document.createElement('div');
    leftInfo.className = 'flex items-center gap-2 min-w-0';
    const dot = childWin.document.createElement('span');
    dot.className = `w-2.5 h-2.5 rounded-full shrink-0 ${
      role === 'viewer3d' ? 'bg-cyan-400' : 'bg-rose-500'
    }`;
    const titleSpan = childWin.document.createElement('span');
    titleSpan.className = 'font-bold text-slate-100 truncate';
    titleSpan.textContent = title;
    const badgeSpan = childWin.document.createElement('span');
    badgeSpan.className =
      'text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-mono-num shrink-0';
    badgeSpan.textContent = role === 'viewer3d' ? '3D VIEWER WINDOW' : 'SETTINGS WINDOW';
    leftInfo.append(dot, titleSpan, badgeSpan);

    const rightBtns = childWin.document.createElement('div');
    rightBtns.className = 'flex items-center gap-1.5 shrink-0';

    const floatBtn = childWin.document.createElement('button');
    floatBtn.type = 'button';
    floatBtn.className =
      'px-2.5 py-1 rounded-lg bg-[#161f30] hover:bg-[#22304a] border border-[#2c3a57] text-cyan-300 text-[11px] font-medium cursor-pointer';
    floatBtn.textContent = '画面内フローティングへ切替';
    floatBtn.onclick = () => setMode('floating');

    const dockBtn = childWin.document.createElement('button');
    dockBtn.type = 'button';
    dockBtn.className =
      'px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer';
    dockBtn.textContent = '元の位置にドッキング戻す';
    dockBtn.onclick = () => setMode('docked');

    rightBtns.append(floatBtn, dockBtn);
    header.append(leftInfo, rightBtns);

    const contentMount = childWin.document.createElement('div');
    contentMount.className = 'flex-1 flex flex-col min-h-0 overflow-hidden';

    wrapper.append(header, contentMount);
    childWin.document.body.appendChild(wrapper);
    popoutSlotRef.current = contentMount;
    setPopoutReadyTick((t) => t + 1);

    let styleSyncRaf = 0;
    const observer = new MutationObserver((mutations) => {
      const hasStyleChange = mutations.some((m) =>
        Array.from(m.addedNodes).some((n) => n.nodeName === 'STYLE' || n.nodeName === 'LINK') ||
        Array.from(m.removedNodes).some((n) => n.nodeName === 'STYLE' || n.nodeName === 'LINK')
      );
      if (!hasStyleChange || styleSyncRaf) return;
      styleSyncRaf = requestAnimationFrame(() => {
        styleSyncRaf = 0;
        if (childWin && !childWin.closed) {
          syncStylesToChildWindow(window.document, childWin.document);
          childWin.document.title = `AC Car Studio — ${title}`;
        }
      });
    });
    observer.observe(window.document.head, { childList: true });

    const onChildUnload = () => {
      popoutWinRef.current = null;
      popoutSlotRef.current = null;
      setMode('docked');
    };
    childWin.addEventListener('beforeunload', onChildUnload);

    // Forward Ctrl+Z / Ctrl+Y / Mouse Side Buttons (Back/Forward) from detached pop-out OS window to main app
    const detachShortcuts = attachWindowShortcutListeners(childWin, {
      onUndo: () =>
        window.dispatchEvent(new CustomEvent(ACCS_UNDO_REDO_EVENT, { detail: { action: 'undo' } })),
      onRedo: () =>
        window.dispatchEvent(new CustomEvent(ACCS_UNDO_REDO_EVENT, { detail: { action: 'redo' } })),
      onNav: (direction) =>
        window.dispatchEvent(new CustomEvent(ACCS_NAV_HISTORY_EVENT, { detail: { direction } })),
    });

    const checkInterval = window.setInterval(() => {
      if (!childWin || childWin.closed) {
        window.clearInterval(checkInterval);
        onChildUnload();
      }
    }, 350);

    return () => {
      if (styleSyncRaf) cancelAnimationFrame(styleSyncRaf);
      detachShortcuts();
      observer.disconnect();
      window.clearInterval(checkInterval);
      childWin.removeEventListener('beforeunload', onChildUnload);
    };
  }, [mode, panelId, popoutSize.height, popoutSize.width, role, setMode, title]);

  // Close any open pop-out window cleanly if this panel unmounts
  useEffect(() => {
    return () => {
      if (popoutWinRef.current && !popoutWinRef.current.closed) {
        popoutWinRef.current.close();
      }
      popoutWinRef.current = null;
    };
  }, []);

  // Move the persistent hostEl into whichever slot (docked / floating / popout) is currently active!
  useLayoutEffect(() => {
    let targetParent: HTMLElement | null = null;
    if (mode === 'docked') {
      targetParent = dockedSlotRef.current;
    } else if (mode === 'floating') {
      targetParent = floatingSlotRef.current;
    } else if (mode === 'popout') {
      targetParent = popoutSlotRef.current;
    }

    if (targetParent && hostEl.parentElement !== targetParent) {
      targetParent.appendChild(hostEl);
      // Notify any Three.js ResizeObservers / window resize listeners to recalculate canvas size
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        if (popoutWinRef.current && !popoutWinRef.current.closed) {
          popoutWinRef.current.dispatchEvent(new Event('resize'));
        }
      });
    }
  }, [hostEl, mode, minimized, popoutReadyTick]);

  // Keep in-app floating window inside viewport on main window resize (only active while floating)
  useEffect(() => {
    if (mode !== 'floating') return;
    const onWinResize = () => {
      setBounds((prev) => ({
        ...prev,
        x: Math.max(8, Math.min(window.innerWidth - 160, prev.x)),
        y: Math.max(8, Math.min(window.innerHeight - 60, prev.y)),
      }));
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [mode]);

  const handleStartDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = bounds.x;
    const origY = bounds.y;

    const onMove = (ev: PointerEvent) => {
      const nx = Math.max(8, Math.min(window.innerWidth - 140, origX + (ev.clientX - startX)));
      const ny = Math.max(8, Math.min(window.innerHeight - 52, origY + (ev.clientY - startY)));
      setBounds((prev) => ({ ...prev, x: nx, y: ny }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = bounds.width;
    const origH = bounds.height;

    const onMove = (ev: PointerEvent) => {
      const nw = Math.max(
        340,
        Math.min(window.innerWidth - bounds.x - 10, origW + (ev.clientX - startX))
      );
      const nh = Math.max(
        260,
        Math.min(window.innerHeight - bounds.y - 10, origH + (ev.clientY - startY))
      );
      setBounds((prev) => ({ ...prev, width: nw, height: nh }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const RoleIcon = role === 'viewer3d' ? Box : Sliders;
  const roleBadgeText = role === 'viewer3d' ? '3Dビューワー' : '設定パネル';

  return (
    <>
      {/* Render children once into the persistent hostEl */}
      {createPortal(children, hostEl)}

      {/* 1. DOCKED CONTAINER */}
      {mode === 'docked' && (
        <div className={`flex flex-col min-h-0 ${dockedClassName}`}>
          {!hideDockedHeader && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0c1018] border-b border-[#222b3e] shrink-0 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <RoleIcon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    role === 'viewer3d' ? 'text-cyan-400' : 'text-rose-400'
                  }`}
                />
                <span className="font-bold text-slate-200 truncate">{title}</span>
                {subtitle && (
                  <span className="text-[10px] text-slate-400 font-mono-num truncate hidden sm:inline">
                    ({subtitle})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setMinimized(false);
                    setMode('floating');
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161f30] hover:bg-[#22304a] border border-[#2c3a57] text-cyan-300 text-[10px] font-medium transition-colors"
                  title={`${roleBadgeText}のみを画面内フローティング化します`}
                >
                  <PictureInPicture2 className="w-3 h-3" />
                  {roleBadgeText}をフローティング
                </button>
                <button
                  type="button"
                  onClick={() => setMode('popout')}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-200 text-[10px] font-medium transition-colors"
                  title={`${roleBadgeText}のみを別ウィンドウとして開きます`}
                >
                  <ExternalLink className="w-3 h-3" />
                  別ウィンドウ
                </button>
              </div>
            </div>
          )}
          <div ref={dockedSlotRef} className="flex-1 flex flex-col min-h-0 overflow-hidden" />
        </div>
      )}

      {/* 2. IN-APP FLOATING WINDOW */}
      {mode === 'floating' && (
        <div
          style={{
            left: `${bounds.x}px`,
            top: `${bounds.y}px`,
            width: `${bounds.width}px`,
            height: minimized ? 'auto' : `${bounds.height}px`,
          }}
          className={`fixed z-40 rounded-2xl border ${
            role === 'viewer3d' ? 'border-cyan-400/60' : 'border-rose-500/50'
          } shadow-[0_20px_60px_rgba(0,0,0,0.88)] flex flex-col overflow-hidden ${
            translucent ? 'bg-[#0e131d]/82 backdrop-blur-md' : 'bg-[#101622]'
          }`}
        >
          <div
            onPointerDown={handleStartDrag}
            className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-[#141d2f] via-[#192338] to-[#141d2f] border-b border-[#2b3854] cursor-move select-none shrink-0"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <GripHorizontal className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="font-bold text-xs text-white truncate">{title}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono-num shrink-0 ${
                  role === 'viewer3d'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {role === 'viewer3d' ? '3D VIEWER' : 'SETTINGS'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {role === 'settings' && (
                <button
                  type="button"
                  onClick={() => setTranslucent((v) => !v)}
                  className={`p-1 rounded border text-[10px] ${
                    translucent
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'bg-[#0d121c] border-[#29354d] text-slate-400 hover:text-white'
                  }`}
                  title="背景透過モード切替"
                >
                  <Eye className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setMinimized((v) => !v)}
                className="p-1 rounded bg-[#0d121c] border border-[#29354d] text-slate-300 hover:text-white"
                title={minimized ? '展開する' : '折りたたむ'}
              >
                {minimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>
              <button
                type="button"
                onClick={() => setMode('popout')}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 text-rose-200 text-[10px] font-semibold"
                title="別ウィンドウ(OS独立ウィンドウ)として開く"
              >
                <ExternalLink className="w-3 h-3" />
                別ウィンドウ
              </button>
              <button
                type="button"
                onClick={() => setMode('docked')}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold"
                title="元の位置へドッキング戻す"
              >
                <PanelRightClose className="w-3 h-3" />
                戻す
              </button>
            </div>
          </div>

          <div
            ref={floatingSlotRef}
            style={{ display: minimized ? 'none' : 'flex' }}
            className="flex-1 flex-col min-h-0 overflow-hidden relative"
          />
          {!minimized && (
            <div
              onPointerDown={handleStartResize}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-end justify-end p-0.5 text-cyan-400/70 hover:text-cyan-300 z-20"
              title="ドラッグしてサイズ変更"
            >
              <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
                <path d="M9 1v8H1L9 1z" />
              </svg>
            </div>
          )}
        </div>
      )}
    </>
  );
};
