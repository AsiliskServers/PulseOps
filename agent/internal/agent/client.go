package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/AsiliskServers/PulseOps/agent/internal/platform"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

type HTTPError struct {
	Method     string
	Route      string
	StatusCode int
	Body       string
}

func (err *HTTPError) Error() string {
	return fmt.Sprintf(
		"remote %s %s failed with status %d: %s",
		err.Method,
		err.Route,
		err.StatusCode,
		err.Body,
	)
}

type EnrollRequest struct {
	EnrollmentToken    string `json:"enrollmentToken"`
	Hostname           string `json:"hostname"`
	Environment        string `json:"environment"`
	AgentVersion       string `json:"agentVersion"`
	OSName             string `json:"osName"`
	OSVersion          string `json:"osVersion"`
	Name               string `json:"name,omitempty"`
	ShellAccessEnabled bool   `json:"shellAccessEnabled"`
}

type EnrollResponse struct {
	AgentID                string `json:"agentId"`
	AgentSecret            string `json:"agentSecret"`
	ServerID               string `json:"serverId"`
	ReportIntervalSeconds  int    `json:"reportIntervalSeconds"`
	JobPollIntervalSeconds int    `json:"jobPollIntervalSeconds"`
}

type ClaimJobResponse struct {
	Job *ClaimedJob `json:"job"`
}

type ClaimedJob struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type JobResultRequest struct {
	Status        string    `json:"status"`
	StartedAt     time.Time `json:"startedAt"`
	FinishedAt    time.Time `json:"finishedAt"`
	OutputPreview string    `json:"outputPreview,omitempty"`
	ErrorMessage  string    `json:"errorMessage,omitempty"`
}

type TerminalResize struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

type TerminalAction struct {
	SessionID string          `json:"sessionId"`
	Open      bool            `json:"open"`
	Close     bool            `json:"close"`
	Input     string          `json:"input,omitempty"`
	Resize    *TerminalResize `json:"resize,omitempty"`
	Shell     string          `json:"shell"`
	Cwd       string          `json:"cwd"`
}

type TerminalOutput struct {
	SessionID string `json:"sessionId"`
	Data      string `json:"data"`
}

type TerminalClosed struct {
	SessionID string `json:"sessionId"`
	Reason    string `json:"reason,omitempty"`
}

type TerminalSyncRequest struct {
	AgentID     string           `json:"agentId"`
	AgentSecret string           `json:"agentSecret"`
	Opened      []string         `json:"opened,omitempty"`
	Outputs     []TerminalOutput `json:"outputs,omitempty"`
	Closed      []TerminalClosed `json:"closed,omitempty"`
}

type TerminalSyncResponse struct {
	Sessions []TerminalAction `json:"sessions"`
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Transport: &http.Transport{
				MaxIdleConns:        64,
				MaxIdleConnsPerHost: 16,
				MaxConnsPerHost:     32,
				IdleConnTimeout:     90 * time.Second,
				ForceAttemptHTTP2:   true,
			},
			Timeout: 2 * time.Minute,
		},
	}
}

func (client *Client) Enroll(ctx context.Context, payload EnrollRequest) (EnrollResponse, error) {
	var response EnrollResponse
	err := client.doJSON(ctx, http.MethodPost, "/api/agent/enroll", payload, &response)
	return response, err
}

func (client *Client) CheckAuth(ctx context.Context, agentID string, agentSecret string) error {
	return client.doJSON(ctx, http.MethodPost, "/api/agent/auth/check", map[string]string{
		"agentId":     agentID,
		"agentSecret": agentSecret,
	}, nil)
}

func (client *Client) Report(
	ctx context.Context,
	agentID string,
	agentSecret string,
	meta platform.Metadata,
	summary platform.Summary,
) error {
	return client.doJSON(ctx, http.MethodPost, "/api/agent/report", map[string]any{
		"agentId":            agentID,
		"agentSecret":        agentSecret,
		"hostname":           meta.Hostname,
		"agentVersion":       meta.AgentVersion,
		"osName":             meta.OSName,
		"osVersion":          meta.OSVersion,
		"shellAccessEnabled": meta.ShellAccessEnabled,
		"reachable":          summary.Reachable,
		"upgradableCount":    summary.UpgradableCount,
		"securityCount":      summary.SecurityCount,
		"rebootRequired":     summary.RebootRequired,
		"checkedAt":          summary.CheckedAt.Format(time.RFC3339),
		"outputPreview":      summary.OutputPreview,
	}, nil)
}

func (client *Client) ClaimJob(ctx context.Context, agentID string, agentSecret string) (*ClaimedJob, error) {
	var response ClaimJobResponse
	err := client.doJSON(ctx, http.MethodPost, "/api/agent/jobs/claim", map[string]string{
		"agentId":     agentID,
		"agentSecret": agentSecret,
	}, &response)
	return response.Job, err
}

func (client *Client) SendJobResult(
	ctx context.Context,
	agentID string,
	agentSecret string,
	jobID string,
	payload JobResultRequest,
) error {
	body := map[string]any{
		"agentId":       agentID,
		"agentSecret":   agentSecret,
		"status":        payload.Status,
		"startedAt":     payload.StartedAt.Format(time.RFC3339),
		"outputPreview": payload.OutputPreview,
		"errorMessage":  payload.ErrorMessage,
	}

	if !payload.FinishedAt.IsZero() {
		body["finishedAt"] = payload.FinishedAt.Format(time.RFC3339)
	}

	return client.doJSON(ctx, http.MethodPost, "/api/agent/jobs/"+jobID+"/result", body, nil)
}

func (client *Client) SyncTerminals(
	ctx context.Context,
	agentID string,
	agentSecret string,
	payload TerminalSyncRequest,
) ([]TerminalAction, error) {
	var response TerminalSyncResponse
	err := client.doJSON(ctx, http.MethodPost, "/api/agent/terminals/sync", map[string]any{
		"agentId":     agentID,
		"agentSecret": agentSecret,
		"opened":      payload.Opened,
		"outputs":     payload.Outputs,
		"closed":      payload.Closed,
	}, &response)
	if err != nil {
		return nil, err
	}

	return response.Sessions, nil
}

func (client *Client) doJSON(
	ctx context.Context,
	method string,
	route string,
	requestBody any,
	responseBody any,
) error {
	var payload []byte
	var err error

	if requestBody != nil {
		payload, err = json.Marshal(requestBody)
		if err != nil {
			return err
		}
	}

	request, err := http.NewRequestWithContext(ctx, method, client.baseURL+route, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := client.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return err
	}

	if response.StatusCode >= 400 {
		return &HTTPError{
			Method:     method,
			Route:      route,
			StatusCode: response.StatusCode,
			Body:       strings.TrimSpace(string(body)),
		}
	}

	if responseBody == nil || len(body) == 0 {
		return nil
	}

	return json.Unmarshal(body, responseBody)
}
