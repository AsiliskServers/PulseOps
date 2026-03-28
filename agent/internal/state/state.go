package state

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type AgentState struct {
	AgentID     string `json:"agentId"`
	AgentSecret string `json:"agentSecret"`
	ServerID    string `json:"serverId"`
}

func Save(path string, value AgentState) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, content, 0o600)
}

func Load(path string) (AgentState, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return AgentState{}, err
	}

	var result AgentState
	if err := json.Unmarshal(content, &result); err != nil {
		return AgentState{}, err
	}

	return result, nil
}
