import { randomUUID } from "node:crypto";

export type TerminalSessionStatus = "pending" | "connected" | "closed";

export type TerminalResize = {
  cols: number;
  rows: number;
};

export type TerminalAction = {
  sessionId: string;
  open: boolean;
  close: boolean;
  input: string;
  resize: TerminalResize | null;
  shell: string;
  cwd: string;
};

export type AgentTerminalSyncPayload = {
  opened?: string[];
  outputs?: Array<{
    sessionId: string;
    data: string;
  }>;
  closed?: Array<{
    sessionId: string;
    reason?: string | null;
  }>;
};

export type TerminalEvent =
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

type TerminalListener = (event: TerminalEvent) => void;

type TerminalSession = {
  id: string;
  serverId: string;
  userId: string;
  status: TerminalSessionStatus;
  inputQueue: string;
  outputHistory: string;
  pendingResize: TerminalResize | null;
  closeRequested: boolean;
  closeReason: string | null;
  listeners: Set<TerminalListener>;
  createdAt: number;
  updatedAt: number;
};

const MAX_HISTORY_CHARS = 120_000;
const CLOSED_RETENTION_MS = 60_000;
const IDLE_RETENTION_MS = 15 * 60_000;
const SHELL_PATH = "/bin/bash";
const SHELL_WORKDIR = "/root";
const TERMINAL_MAX_COLS = 360;
const TERMINAL_MAX_ROWS = 120;

function clampResize(value: TerminalResize): TerminalResize {
  return {
    cols: Math.max(40, Math.min(TERMINAL_MAX_COLS, Math.trunc(value.cols))),
    rows: Math.max(12, Math.min(TERMINAL_MAX_ROWS, Math.trunc(value.rows))),
  };
}

function trimHistory(value: string): string {
  if (value.length <= MAX_HISTORY_CHARS) {
    return value;
  }

  return value.slice(value.length - MAX_HISTORY_CHARS);
}

export class TerminalBroker {
  private sessions = new Map<string, TerminalSession>();

  createOrReuse(serverId: string, userId: string) {
    this.cleanup();

    const existing = [...this.sessions.values()]
      .filter(
        (session) =>
          session.serverId === serverId &&
          session.userId === userId &&
          session.status !== "closed"
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];

    if (existing) {
      existing.updatedAt = Date.now();
      return this.snapshot(existing);
    }

    const now = Date.now();
    const session: TerminalSession = {
      id: randomUUID(),
      serverId,
      userId,
      status: "pending",
      inputQueue: "",
      outputHistory: "",
      pendingResize: { cols: 120, rows: 32 },
      closeRequested: false,
      closeReason: null,
      listeners: new Set(),
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, session);
    return this.snapshot(session);
  }

  getSnapshot(sessionId: string, userId: string) {
    const session = this.requireOwnedSession(sessionId, userId);
    return this.snapshot(session);
  }

  subscribe(sessionId: string, userId: string, listener: TerminalListener) {
    const session = this.requireOwnedSession(sessionId, userId);
    session.listeners.add(listener);
    session.updatedAt = Date.now();

    return () => {
      session.listeners.delete(listener);
      session.updatedAt = Date.now();
      this.cleanup();
    };
  }

  enqueueInput(sessionId: string, userId: string, data: string) {
    const session = this.requireOwnedSession(sessionId, userId);

    if (session.status === "closed") {
      throw new Error("Terminal session is closed");
    }

    session.inputQueue += data;
    session.updatedAt = Date.now();
  }

  updateResize(sessionId: string, userId: string, resize: TerminalResize) {
    const session = this.requireOwnedSession(sessionId, userId);

    if (session.status === "closed") {
      throw new Error("Terminal session is closed");
    }

    session.pendingResize = clampResize(resize);
    session.updatedAt = Date.now();
  }

  closeForUser(sessionId: string, userId: string) {
    const session = this.requireOwnedSession(sessionId, userId);

    if (session.status === "closed") {
      return;
    }

    if (session.status === "pending") {
      this.markClosed(session, "Session fermee.");
      return;
    }

    this.requestClose(session, "Session fermee.");
  }

  syncForAgent(serverId: string, payload: AgentTerminalSyncPayload): { sessions: TerminalAction[] } {
    this.cleanup();

    for (const sessionId of payload.opened ?? []) {
      const session = this.sessions.get(sessionId);
      if (!session || session.serverId !== serverId || session.status === "closed") {
        continue;
      }

      if (session.status !== "connected") {
        session.status = "connected";
        session.updatedAt = Date.now();
        this.emit(session, {
          type: "status",
          sessionId: session.id,
          status: session.status,
        });
      }
    }

    for (const output of payload.outputs ?? []) {
      const session = this.sessions.get(output.sessionId);
      if (!session || session.serverId !== serverId || session.status === "closed") {
        continue;
      }

      if (session.status !== "connected") {
        session.status = "connected";
        this.emit(session, {
          type: "status",
          sessionId: session.id,
          status: session.status,
        });
      }

      if (output.data) {
        session.outputHistory = trimHistory(session.outputHistory + output.data);
        this.emit(session, {
          type: "output",
          sessionId: session.id,
          data: output.data,
        });
      }

      session.updatedAt = Date.now();
    }

    for (const closed of payload.closed ?? []) {
      const session = this.sessions.get(closed.sessionId);
      if (!session || session.serverId !== serverId || session.status === "closed") {
        continue;
      }

      this.markClosed(session, closed.reason ?? null);
    }

    const actions: TerminalAction[] = [];

    for (const session of this.sessions.values()) {
      if (session.serverId !== serverId || session.status === "closed") {
        continue;
      }

      const action: TerminalAction = {
        sessionId: session.id,
        open: session.status === "pending",
        close: session.closeRequested,
        input: session.inputQueue,
        resize: session.pendingResize,
        shell: SHELL_PATH,
        cwd: SHELL_WORKDIR,
      };

      if (!action.open && !action.close && !action.resize && action.input.length === 0) {
        continue;
      }

      session.inputQueue = "";
      session.pendingResize = null;
      session.updatedAt = Date.now();
      actions.push(action);
    }

    return { sessions: actions };
  }

  private snapshot(session: TerminalSession) {
    return {
      sessionId: session.id,
      status: session.status,
      outputHistory: session.outputHistory,
    };
  }

  private requireOwnedSession(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);

    if (!session || session.userId !== userId) {
      throw new Error("Terminal session not found");
    }

    return session;
  }

  private emit(session: TerminalSession, event: TerminalEvent) {
    for (const listener of session.listeners) {
      listener(event);
    }
  }

  private markClosed(session: TerminalSession, reason: string | null) {
    session.status = "closed";
    session.closeRequested = false;
    session.closeReason = reason ?? session.closeReason;
    session.updatedAt = Date.now();

    this.emit(session, {
      type: "status",
      sessionId: session.id,
      status: session.status,
    });
    this.emit(session, {
      type: "closed",
      sessionId: session.id,
      reason: session.closeReason,
    });
  }

  private requestClose(session: TerminalSession, reason: string | null) {
    session.closeRequested = true;
    session.closeReason = reason ?? session.closeReason;
    session.updatedAt = Date.now();
  }

  private cleanup() {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions) {
      if (session.status === "closed" && now - session.updatedAt > CLOSED_RETENTION_MS) {
        this.sessions.delete(sessionId);
        continue;
      }

      if (session.status !== "closed" && now - session.updatedAt > IDLE_RETENTION_MS) {
        if (session.status === "pending") {
          this.markClosed(session, "Session expiree.");
          continue;
        }

        this.requestClose(session, "Session expiree.");
      }
    }
  }
}
