package shell

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"

	"github.com/AsiliskServers/PulseOps/agent/internal/agent"
	"github.com/creack/pty"
)

type session struct {
	id           string
	cmd          *exec.Cmd
	tty          *os.File
	outputBuffer []byte
	pendingOpen  bool
	closed       bool
	closeSent    bool
	closeReason  string
	mu           sync.Mutex
}

type Manager struct {
	mu       sync.Mutex
	sessions map[string]*session
}

func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*session),
	}
}

func (manager *Manager) Apply(actions []agent.TerminalAction) error {
	for _, action := range actions {
		if action.Open {
			if err := manager.open(action); err != nil {
				return err
			}
		}

		if action.Resize != nil {
			if err := manager.resize(action.SessionID, *action.Resize); err != nil {
				return err
			}
		}

		if action.Input != "" {
			if err := manager.write(action.SessionID, action.Input); err != nil {
				return err
			}
		}

		if action.Close {
			manager.close(action.SessionID, "Session fermée.")
		}
	}

	return nil
}

func (manager *Manager) CollectUpdates() agent.TerminalSyncRequest {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	request := agent.TerminalSyncRequest{}

	for sessionID, current := range manager.sessions {
		current.mu.Lock()

		if current.pendingOpen {
			request.Opened = append(request.Opened, current.id)
			current.pendingOpen = false
		}

		if len(current.outputBuffer) > 0 {
			request.Outputs = append(request.Outputs, agent.TerminalOutput{
				SessionID: current.id,
				Data:      string(current.outputBuffer),
			})
			current.outputBuffer = nil
		}

		if current.closed && !current.closeSent {
			request.Closed = append(request.Closed, agent.TerminalClosed{
				SessionID: current.id,
				Reason:    current.closeReason,
			})
			current.closeSent = true
		}

		shouldDelete := current.closed && current.closeSent
		current.mu.Unlock()

		if shouldDelete {
			delete(manager.sessions, sessionID)
		}
	}

	return request
}

func (manager *Manager) HasActiveSessions() bool {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	for _, current := range manager.sessions {
		current.mu.Lock()
		active := !current.closed || !current.closeSent
		current.mu.Unlock()

		if active {
			return true
		}
	}

	return false
}

func (manager *Manager) Shutdown() {
	manager.mu.Lock()
	ids := make([]string, 0, len(manager.sessions))
	for sessionID := range manager.sessions {
		ids = append(ids, sessionID)
	}
	manager.mu.Unlock()

	for _, sessionID := range ids {
		manager.close(sessionID, "Agent arrêté.")
	}
}

func (manager *Manager) open(action agent.TerminalAction) error {
	manager.mu.Lock()
	if _, exists := manager.sessions[action.SessionID]; exists {
		manager.mu.Unlock()
		return nil
	}
	manager.mu.Unlock()

	cmd := exec.Command(action.Shell, "-i")
	if action.Cwd != "" {
		cmd.Dir = action.Cwd
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	size := &pty.Winsize{Rows: 32, Cols: 120}
	if action.Resize != nil {
		size = &pty.Winsize{
			Rows: uint16(action.Resize.Rows),
			Cols: uint16(action.Resize.Cols),
		}
	}

	tty, err := pty.StartWithSize(cmd, size)
	if err != nil {
		return err
	}

	current := &session{
		id:          action.SessionID,
		cmd:         cmd,
		tty:         tty,
		pendingOpen: true,
	}

	manager.mu.Lock()
	manager.sessions[action.SessionID] = current
	manager.mu.Unlock()

	go manager.capture(current)
	return nil
}

func (manager *Manager) resize(sessionID string, resize agent.TerminalResize) error {
	current := manager.get(sessionID)
	if current == nil {
		return nil
	}

	return pty.Setsize(current.tty, &pty.Winsize{
		Rows: uint16(resize.Rows),
		Cols: uint16(resize.Cols),
	})
}

func (manager *Manager) write(sessionID string, data string) error {
	current := manager.get(sessionID)
	if current == nil {
		return nil
	}

	_, err := current.tty.WriteString(data)
	return err
}

func (manager *Manager) close(sessionID string, reason string) {
	current := manager.get(sessionID)
	if current == nil {
		return
	}

	current.mu.Lock()
	if current.closed {
		current.mu.Unlock()
		return
	}
	current.closed = true
	current.closeReason = reason
	current.mu.Unlock()

	if current.tty != nil {
		_ = current.tty.Close()
	}
	if current.cmd != nil && current.cmd.Process != nil {
		_ = current.cmd.Process.Kill()
	}
}

func (manager *Manager) capture(current *session) {
	buffer := make([]byte, 4096)

	for {
		count, err := current.tty.Read(buffer)
		if count > 0 {
			current.mu.Lock()
			current.outputBuffer = append(current.outputBuffer, buffer[:count]...)
			if len(current.outputBuffer) > 64_000 {
				current.outputBuffer = current.outputBuffer[len(current.outputBuffer)-64_000:]
			}
			current.mu.Unlock()
		}

		if err != nil {
			if err != io.EOF {
				manager.markClosed(current, fmt.Sprintf("Shell terminé: %v", err))
			} else {
				manager.markClosed(current, "Shell terminé.")
			}
			return
		}
	}
}

func (manager *Manager) markClosed(current *session, reason string) {
	current.mu.Lock()
	defer current.mu.Unlock()

	if current.closed {
		if current.closeReason == "" {
			current.closeReason = reason
		}
		return
	}

	current.closed = true
	current.closeReason = reason
}

func (manager *Manager) get(sessionID string) *session {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	return manager.sessions[sessionID]
}
