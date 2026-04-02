import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  closeTerminalSession,
  getTerminalStreamUrl,
  openTerminalSession,
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
  if (message.includes("/api/terminals/sessions") && message.includes("not found")) {
    return "Le terminal agent n'est pas encore deploye sur cette instance. Mets a jour le serveur principal puis les agents.";
  }

  return message;
}

function clampTerminalSize(input: { cols: number; rows: number }) {
  return {
    cols: Math.max(40, Math.min(TERMINAL_MAX_COLS, Math.trunc(input.cols))),
    rows: Math.max(12, Math.min(TERMINAL_MAX_ROWS, Math.trunc(input.rows))),
  };
}

export function AgentTerminal({ serverId, serverName, onClose }: Props) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<TerminalSessionResponse | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const inputBufferRef = useRef("");
  const destroyedRef = useRef(false);
  const closingRef = useRef(false);
  const [status, setStatus] = useState<TerminalSessionStatus | "connecting" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
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

    const flushInput = async () => {
      flushTimerRef.current = null;
      const data = inputBufferRef.current;
      const sessionId = sessionRef.current?.sessionId;

      if (!data || !sessionId) {
        return;
      }

      inputBufferRef.current = "";

      try {
        await sendTerminalInput(sessionId, data);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Impossible d'envoyer la commande";
        setError(resolveTerminalErrorMessage(message));
      }
    };

    const queueInput = (data: string) => {
      inputBufferRef.current += data;

      if (flushTimerRef.current !== null) {
        return;
      }

      flushTimerRef.current = window.setTimeout(() => {
        void flushInput();
      }, 40);
    };

    terminal.onData((data) => {
      queueInput(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeTimerRef.current = window.setTimeout(() => {
        const sessionId = sessionRef.current?.sessionId;
        const fit = fitAddonRef.current;

        if (!sessionId || !fit) {
          return;
        }

        fit.fit();
        const size = clampTerminalSize({
          cols: terminal.cols,
          rows: terminal.rows,
        });

        void resizeTerminalSession(sessionId, size).catch((cause) => {
          const message = cause instanceof Error ? cause.message : "Impossible de redimensionner le terminal";
          setError(resolveTerminalErrorMessage(message));
        });
      }, 120);
    });

    if (canvasRef.current) {
      resizeObserver.observe(canvasRef.current);
    }

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
          terminal.write(payload.outputHistory);
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

        terminal.write(payload.data);
      });

      stream.addEventListener("closed", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as Extract<
          TerminalEvent,
          { type: "closed" }
        >;

        setStatus("closed");
        if (payload.reason) {
          terminal.writeln("");
          terminal.writeln(`[PulseOps] ${payload.reason}`);
        }
      });

      stream.onerror = () => {
        if (destroyedRef.current || closingRef.current) {
          return;
        }

        setStatus("error");
        setError("Le flux terminal a ete interrompu.");
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

        fitAddon.fit();
        await resizeTerminalSession(
          session.sessionId,
          clampTerminalSize({
          cols: terminal.cols,
          rows: terminal.rows,
          })
        );

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

    return () => {
      destroyedRef.current = true;

      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }

      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeObserver.disconnect();
      streamRef.current?.close();
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
          });
        }, 20);
      }
      terminalRef.current?.focus();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Impossible d'acceder au presse-papiers";
      setError(resolveTerminalErrorMessage(message));
    }
  }

  async function handleClose() {
    closingRef.current = true;
    streamRef.current?.close();

    const sessionId = sessionRef.current?.sessionId;
    if (sessionId) {
      await closeTerminalSession(sessionId).catch(() => undefined);
    }

    onClose();
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

      <div className="agent-terminal-surface">
        <div ref={canvasRef} className="agent-terminal-canvas" />
      </div>

      <footer className="agent-terminal-footer">
        <span>Selection de texte active. Le terminal accepte aussi le collage clavier natif.</span>
        <strong>{sessionRef.current?.sessionId ?? "Session en preparation"}</strong>
      </footer>
    </section>
  );
}
