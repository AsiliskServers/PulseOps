import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  closeTerminalSession,
  getTerminalStreamUrl,
  openTerminalSession,
  releaseTerminalSession,
  releaseTerminalSessionOnPageLeave,
  resizeTerminalSession,
  sendTerminalInput,
  type TerminalSessionResponse,
  type TerminalSessionStatus,
} from "../api/terminals";

type Props = {
  serverId: string;
  serverName: string;
  onClose: () => void;
};

const TERMINAL_MAX_COLS = 360;
const TERMINAL_MAX_ROWS = 120;
const TERMINAL_AUTO_CLOSE_MS = 6_000;

type TerminalEvent =
  | {
      type: "bootstrap";
      sessionId: string;
      status: TerminalSessionStatus;
      outputHistory: string;
    }
  | {
      type: "status";
      sessionId: string;
      status: TerminalSessionStatus;
    }
  | {
      type: "output";
      sessionId: string;
      data: string;
    }
  | {
      type: "closed";
      sessionId: string;
      reason: string | null;
    };

function getStatusLabel(status: TerminalSessionStatus | "connecting" | "error") {
  if (status === "connecting") {
    return "Connexion...";
  }

  if (status === "pending") {
    return "En attente agent";
  }

  if (status === "connected") {
    return "Connecte";
  }

  if (status === "closed") {
    return "Ferme";
  }

  return "Erreur";
}

function getStatusTone(status: TerminalSessionStatus | "connecting" | "error") {
  if (status === "connected") {
    return "ok";
  }

  if (status === "pending" || status === "connecting") {
    return "pending";
  }

  return "critical";
}

function resolveTerminalErrorMessage(message: string) {
  if (message.includes("Terminal session not found")) {
    return "La session terminal n'existe plus. Cette fenetre va se fermer automatiquement.";
  }

  if (message.includes("Terminal session is closed")) {
    return "La session terminal est deja fermee. Cette fenetre va se fermer automatiquement.";
  }

  if (message.includes("/api/terminals/sessions") && message.includes("not found")) {
    return "Le terminal agent n'est pas encore deploye sur cette instance. Mets a jour le serveur principal puis les agents.";
  }

  if (message.toLowerCase().includes("shell distant est desactive")) {
    return "Ce serveur utilise un agent sans acces shell. Le terminal root est volontairement indisponible.";
  }

  return message;
}

function shouldAutoCloseTerminal(message: string) {
  return message.includes("Terminal session not found") || message.includes("Terminal session is closed");
}

function clampTerminalSize(input: { cols: number; rows: number }) {
  return {
    cols: Math.max(40, Math.min(TERMINAL_MAX_COLS, Math.trunc(input.cols))),
    rows: Math.max(12, Math.min(TERMINAL_MAX_ROWS, Math.trunc(input.rows))),
  };
}

function isPinnedToBottom(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  return buffer.viewportY >= buffer.baseY;
}

function scheduleAnimationFrames(count: number, callback: () => void) {
  let remaining = count;

  const tick = () => {
    callback();
    remaining -= 1;

    if (remaining > 0) {
      window.requestAnimationFrame(tick);
    }
  };

  window.requestAnimationFrame(tick);
}

export function AgentTerminal({ serverId, serverName, onClose }: Props) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<TerminalSessionResponse | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const sendingInputRef = useRef(false);
  const lastSentSizeRef = useRef<string | null>(null);
  const inputBufferRef = useRef("");
  const destroyedRef = useRef(false);
  const closingRef = useRef(false);
  const [status, setStatus] = useState<TerminalSessionStatus | "connecting" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  const dismissTerminal = (releaseMode: "close" | "release" = "close") => {
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;
    clearAutoCloseTimer();
    streamRef.current?.close();
    streamRef.current = null;

    const sessionId = sessionRef.current?.sessionId;
    if (sessionId) {
      if (releaseMode === "release") {
        void releaseTerminalSession(sessionId).catch(() => undefined);
      } else {
        void closeTerminalSession(sessionId).catch(() => undefined);
      }
    }

    onClose();
  };

  useEffect(() => {
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      scrollback: 5000,
      scrollOnUserInput: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.25,
      theme: {
        background: "#0c1722",
        foreground: "#d8e5f2",
        cursor: "#7dd3fc",
        selectionBackground: "rgba(125, 211, 252, 0.28)",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    if (canvasRef.current) {
      terminal.open(canvasRef.current);
      fitAddon.fit();
      terminal.focus();
      terminal.writeln(`[PulseOps] Ouverture du terminal pour ${serverName}`);
      terminal.writeln("[PulseOps] Attente de l'agent...");
    }

    const fitTerminal = (sessionId?: string | null) => {
      const fit = fitAddonRef.current;
      if (!fit) {
        return;
      }

      fit.fit();
      const size = clampTerminalSize({
        cols: terminal.cols,
        rows: terminal.rows,
      });
      const sizeKey = `${size.cols}x${size.rows}`;

      if (lastSentSizeRef.current === sizeKey) {
        return;
      }

      lastSentSizeRef.current = sizeKey;

      if (!sessionId) {
        return;
      }

      void resizeTerminalSession(sessionId, size).catch((cause) => {
        const message = cause instanceof Error ? cause.message : "Impossible de redimensionner le terminal";
        setError(resolveTerminalErrorMessage(message));
        if (shouldAutoCloseTerminal(message)) {
          dismissTerminal();
        }
      });
    };

    const scheduleFlush = (delay: number) => {
      if (flushTimerRef.current !== null) {
        return;
      }

      flushTimerRef.current = window.setTimeout(() => {
        void flushInput();
      }, delay);
    };

    const flushInput = async () => {
      if (sendingInputRef.current) {
        return;
      }

      flushTimerRef.current = null;
      const data = inputBufferRef.current;
      const sessionId = sessionRef.current?.sessionId;

      if (!data || !sessionId) {
        return;
      }

      inputBufferRef.current = "";
      sendingInputRef.current = true;

      try {
        await sendTerminalInput(sessionId, data);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Impossible d'envoyer la commande";
        setError(resolveTerminalErrorMessage(message));
        if (shouldAutoCloseTerminal(message)) {
          dismissTerminal();
        }
      } finally {
        sendingInputRef.current = false;
        if (inputBufferRef.current.length > 0) {
          scheduleFlush(0);
        }
      }
    };

    const queueInput = (data: string) => {
      inputBufferRef.current += data;

      if (data.includes("\r") || data.includes("\n") || data.includes("\u0003")) {
        if (flushTimerRef.current !== null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }

        void flushInput();
        return;
      }

      scheduleFlush(4);
    };

    terminal.onData((data) => {
      queueInput(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeTimerRef.current = window.setTimeout(() => {
        fitTerminal(sessionRef.current?.sessionId);
      }, 20);
    });

    if (frameRef.current) {
      resizeObserver.observe(frameRef.current);
    }

    const viewport = window.visualViewport;
    const handleViewportResize = () => {
      fitTerminal(sessionRef.current?.sessionId);
    };

    viewport?.addEventListener("resize", handleViewportResize);
    window.addEventListener("resize", handleViewportResize);

    const scheduleAutoClose = (terminalMessage?: string) => {
      if (destroyedRef.current || closingRef.current || autoCloseTimerRef.current !== null) {
        return;
      }

      if (terminalMessage) {
        terminal.writeln("");
        terminal.writeln(`[PulseOps] ${terminalMessage}`);
      }
      terminal.writeln("[PulseOps] Fermeture automatique de cette fenetre dans quelques secondes.");

      autoCloseTimerRef.current = window.setTimeout(() => {
        autoCloseTimerRef.current = null;
        dismissTerminal();
      }, TERMINAL_AUTO_CLOSE_MS);
    };

    const bindStream = (session: TerminalSessionResponse) => {
      const stream = new EventSource(getTerminalStreamUrl(session.sessionId));
      streamRef.current = stream;

      stream.addEventListener("bootstrap", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as Extract<
          TerminalEvent,
          { type: "bootstrap" }
        >;

        setStatus(payload.status);
        if (payload.outputHistory) {
          terminal.write(payload.outputHistory, () => {
            terminal.scrollToBottom();
          });
        }
      });

      stream.addEventListener("status", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as Extract<
          TerminalEvent,
          { type: "status" }
        >;

        setStatus(payload.status);
      });

      stream.addEventListener("output", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as Extract<
          TerminalEvent,
          { type: "output" }
        >;

        const shouldStick = isPinnedToBottom(terminal);
        terminal.write(payload.data, () => {
          if (shouldStick) {
            terminal.scrollToBottom();
          }
        });
      });

      stream.addEventListener("closed", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as Extract<
          TerminalEvent,
          { type: "closed" }
        >;

        setStatus("closed");
        scheduleAutoClose(payload.reason ?? undefined);
      });

      stream.onerror = () => {
        if (destroyedRef.current || closingRef.current) {
          return;
        }

        stream.close();
        if (streamRef.current === stream) {
          streamRef.current = null;
        }

        setStatus("error");
        setError("Le flux terminal a ete interrompu. Cette fenetre va se fermer automatiquement.");
        scheduleAutoClose("Le flux terminal a ete interrompu.");
      };
    };

    void (async () => {
      try {
        const session = await openTerminalSession(serverId);

        if (destroyedRef.current) {
          await closeTerminalSession(session.sessionId).catch(() => undefined);
          return;
        }

        sessionRef.current = session;
        setStatus(session.status);

        bindStream(session);

        fitTerminal(session.sessionId);
        scheduleAnimationFrames(3, () => {
          fitTerminal(session.sessionId);
        });

        if (inputBufferRef.current) {
          const pending = inputBufferRef.current;
          inputBufferRef.current = "";
          await sendTerminalInput(session.sessionId, pending);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Impossible d'ouvrir le terminal";
        setStatus("error");
        setError(resolveTerminalErrorMessage(message));
      }
    })();

    const handlePageLeave = () => {
      const sessionId = sessionRef.current?.sessionId;
      if (!sessionId) {
        return;
      }

      releaseTerminalSessionOnPageLeave(sessionId);
    };

    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);

    return () => {
      destroyedRef.current = true;
      clearAutoCloseTimer();

      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }

      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeObserver.disconnect();
      viewport?.removeEventListener("resize", handleViewportResize);
      window.removeEventListener("resize", handleViewportResize);
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      streamRef.current?.close();
      streamRef.current = null;
      terminal.dispose();

      const sessionId = sessionRef.current?.sessionId;
      if (sessionId && !closingRef.current) {
        void closeTerminalSession(sessionId).catch(() => undefined);
      }
    };
  }, [serverId, serverName]);

  async function handleCopy() {
    const selection = terminalRef.current?.getSelection()?.trim();

    if (!selection || !navigator.clipboard?.writeText) {
      return;
    }

    await navigator.clipboard.writeText(selection);
  }

  async function handlePaste() {
    if (!navigator.clipboard?.readText) {
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        return;
      }

      inputBufferRef.current += text;
      if (flushTimerRef.current === null) {
        flushTimerRef.current = window.setTimeout(() => {
          flushTimerRef.current = null;
          const pending = inputBufferRef.current;
          const sessionId = sessionRef.current?.sessionId;

          if (!pending || !sessionId) {
            return;
          }

          inputBufferRef.current = "";
          void sendTerminalInput(sessionId, pending).catch((cause) => {
            const message =
              cause instanceof Error ? cause.message : "Impossible de coller dans le terminal";
            setError(resolveTerminalErrorMessage(message));
            if (shouldAutoCloseTerminal(message)) {
              dismissTerminal();
            }
          });
        }, 4);
      }
      terminalRef.current?.focus();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Impossible d'acceder au presse-papiers";
      setError(resolveTerminalErrorMessage(message));
    }
  }

  async function handleClose() {
    dismissTerminal();
  }

  return (
    <section className="agent-terminal-shell panel">
      <header className="agent-terminal-topbar">
        <div>
          <p className="section-kicker">Terminal agent</p>
          <div className="agent-terminal-heading">
            <h3>{serverName}</h3>
            <span className={`status-pill ${getStatusTone(status)}`}>{getStatusLabel(status)}</span>
          </div>
          <p className="page-copy">Shell root proxifie via l&apos;agent installe sur le serveur cible.</p>
          <p className="agent-terminal-meta">
            <span>Session</span>
            <strong>{sessionRef.current?.sessionId ?? "Preparation..."}</strong>
          </p>
        </div>

        <div className="inline-actions">
          <button className="ghost-button small" type="button" onClick={() => void handleCopy()}>
            Copier
          </button>
          <button className="ghost-button small" type="button" onClick={() => void handlePaste()}>
            Coller
          </button>
          <button className="primary-button" type="button" onClick={() => void handleClose()}>
            Fermer
          </button>
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}

      <div ref={surfaceRef} className="agent-terminal-surface">
        <div ref={frameRef} className="agent-terminal-frame">
          <div ref={canvasRef} className="agent-terminal-canvas" />
        </div>
      </div>
    </section>
  );
}
