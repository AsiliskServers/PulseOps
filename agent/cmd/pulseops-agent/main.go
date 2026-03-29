package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AsiliskServers/PulseOps/agent/internal/agent"
	"github.com/AsiliskServers/PulseOps/agent/internal/config"
	"github.com/AsiliskServers/PulseOps/agent/internal/platform"
	"github.com/AsiliskServers/PulseOps/agent/internal/state"
	"github.com/AsiliskServers/PulseOps/agent/internal/update"
)

var version = "dev"

func main() {
	if len(os.Args) < 2 {
		log.Fatalf("usage: %s <enroll|run>", os.Args[0])
	}

	switch os.Args[1] {
	case "enroll":
		if err := runEnroll(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	case "run":
		if err := runService(os.Args[2:]); err != nil {
			log.Fatal(err)
		}
	default:
		log.Fatalf("unknown command %q", os.Args[1])
	}
}

func runEnroll(args []string) error {
	fs := flag.NewFlagSet("enroll", flag.ContinueOnError)
	configPath := fs.String("config", "", "path to agent env file")

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}

	enrollment, err := enrollAgent(cfg)
	if err != nil {
		return err
	}

	payload, _ := json.MarshalIndent(map[string]string{
		"serverId": enrollment.ServerID,
		"agentId":  enrollment.AgentID,
		"status":   "enrolled",
	}, "", "  ")
	fmt.Println(string(payload))
	return nil
}

func enrollAgent(cfg config.Config) (agent.EnrollResponse, error) {
	meta, err := platform.CollectMetadata(version, cfg.NameOverride)
	if err != nil {
		return agent.EnrollResponse{}, err
	}

	client := agent.NewClient(cfg.ServerURL)
	enrollment, err := client.Enroll(context.Background(), agent.EnrollRequest{
		EnrollmentToken: cfg.EnrollmentToken,
		Hostname:        meta.Hostname,
		Environment:     cfg.Environment,
		AgentVersion:    meta.AgentVersion,
		OSName:          meta.OSName,
		OSVersion:       meta.OSVersion,
		Name:            meta.DisplayName,
	})
	if err != nil {
		return agent.EnrollResponse{}, err
	}

	if enrollment.ReportIntervalSeconds > 0 {
		cfg.ReportIntervalSeconds = enrollment.ReportIntervalSeconds
	}
	if enrollment.JobPollIntervalSeconds > 0 {
		cfg.JobPollIntervalSeconds = enrollment.JobPollIntervalSeconds
	}

	if err := state.Save(cfg.StateFile, state.AgentState{
		AgentID:     enrollment.AgentID,
		AgentSecret: enrollment.AgentSecret,
		ServerID:    enrollment.ServerID,
	}); err != nil {
		return agent.EnrollResponse{}, err
	}

	return enrollment, nil
}

func runService(args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	configPath := fs.String("config", "", "path to agent env file")

	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}

	checkForUpdate := func() (bool, error) {
		if !cfg.AutoUpdate {
			return false, nil
		}

		updated, nextVersion, err := update.CheckAndApply(context.Background(), cfg.ServerURL, version)
		if err != nil {
			return false, err
		}

		if updated {
			log.Printf("agent updated from %s to %s, restarting service", version, nextVersion)
		}

		return updated, nil
	}

	if updated, err := checkForUpdate(); err != nil {
		log.Printf("initial auto-update check failed: %v", err)
	} else if updated {
		return nil
	}

	currentState, err := state.Load(cfg.StateFile)
	if err != nil {
		if cfg.EnrollmentToken == "" {
			return err
		}

		log.Printf("state file missing or unreadable, attempting fresh enrollment")
		enrollment, enrollErr := enrollAgent(cfg)
		if enrollErr != nil {
			return enrollErr
		}

		currentState = state.AgentState{
			AgentID:     enrollment.AgentID,
			AgentSecret: enrollment.AgentSecret,
			ServerID:    enrollment.ServerID,
		}
	}

	meta, err := platform.CollectMetadata(version, cfg.NameOverride)
	if err != nil {
		return err
	}

	client := agent.NewClient(cfg.ServerURL)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	reportTicker := time.NewTicker(time.Duration(cfg.ReportIntervalSeconds) * time.Second)
	defer reportTicker.Stop()
	jobTicker := time.NewTicker(time.Duration(cfg.JobPollIntervalSeconds) * time.Second)
	defer jobTicker.Stop()
	updateTicker := time.NewTicker(time.Duration(cfg.AutoUpdateIntervalSeconds) * time.Second)
	defer updateTicker.Stop()

	reportOnce := func() error {
		summary, err := platform.RunRefresh()
		if err != nil {
			return err
		}

		return client.Report(ctx, currentState.AgentID, currentState.AgentSecret, meta, summary)
	}

	handleJob := func() error {
		job, err := client.ClaimJob(ctx, currentState.AgentID, currentState.AgentSecret)
		if err != nil {
			return err
		}
		if job == nil {
			return nil
		}

		startedAt := time.Now().UTC()
		if err := client.SendJobResult(ctx, currentState.AgentID, currentState.AgentSecret, job.ID, agent.JobResultRequest{
			Status:     "running",
			StartedAt:  startedAt,
			FinishedAt: time.Time{},
		}); err != nil {
			return err
		}

		var summary platform.Summary
		var execErr error

		switch job.Type {
		case "refresh":
			summary, execErr = platform.RunRefresh()
		case "upgrade":
			summary, execErr = platform.RunUpgrade(cfg.AllowUpgrade)
		default:
			execErr = fmt.Errorf("unsupported job type %q", job.Type)
		}

		if execErr == nil {
			if err := client.Report(ctx, currentState.AgentID, currentState.AgentSecret, meta, summary); err != nil {
				log.Printf("report after job failed: %v", err)
			}
		}

		status := "success"
		errorMessage := ""
		output := summary.OutputPreview
		if execErr != nil {
			status = "failed"
			errorMessage = execErr.Error()
			if errors.Is(execErr, platform.ErrUpgradeDisabled) {
				output = "Upgrade disabled on this agent."
			}
		}

		return client.SendJobResult(ctx, currentState.AgentID, currentState.AgentSecret, job.ID, agent.JobResultRequest{
			Status:        status,
			StartedAt:     startedAt,
			FinishedAt:    time.Now().UTC(),
			OutputPreview: output,
			ErrorMessage:  errorMessage,
		})
	}

	if err := reportOnce(); err != nil {
		log.Printf("initial report failed: %v", err)
	}

	if err := handleJob(); err != nil {
		log.Printf("initial job poll failed: %v", err)
	}

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-reportTicker.C:
			if err := reportOnce(); err != nil {
				log.Printf("periodic report failed: %v", err)
			}
		case <-jobTicker.C:
			if err := handleJob(); err != nil {
				log.Printf("job poll failed: %v", err)
			}
		case <-updateTicker.C:
			if updated, err := checkForUpdate(); err != nil {
				log.Printf("auto-update check failed: %v", err)
			} else if updated {
				return nil
			}
		}
	}
}
