package config

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	ServerURL                 string
	EnrollmentToken           string
	Environment               string
	AllowUpgrade              bool
	ShellAccessEnabled        bool
	AutoUpdate                bool
	NameOverride              string
	ReportIntervalSeconds     int
	JobPollIntervalSeconds    int
	AutoUpdateIntervalSeconds int
	StateFile                 string
}

func Load(path string) (Config, error) {
	values := map[string]string{}

	if path != "" {
		file, err := os.Open(path)
		if err != nil {
			return Config{}, err
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			parts := strings.SplitN(line, "=", 2)
			if len(parts) != 2 {
				continue
			}

			values[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}

		if err := scanner.Err(); err != nil {
			return Config{}, err
		}
	}

	cfg := Config{
		ServerURL:                 firstNonEmpty(values["SERVER_URL"], os.Getenv("SERVER_URL")),
		EnrollmentToken:           firstNonEmpty(values["ENROLLMENT_TOKEN"], os.Getenv("ENROLLMENT_TOKEN")),
		Environment:               firstNonEmpty(values["ENVIRONMENT"], os.Getenv("ENVIRONMENT"), "production"),
		AllowUpgrade:              parseBool(firstNonEmpty(values["ALLOW_UPGRADE"], os.Getenv("ALLOW_UPGRADE"), "true")),
		ShellAccessEnabled:        parseBool(firstNonEmpty(values["SHELL_ACCESS_ENABLED"], os.Getenv("SHELL_ACCESS_ENABLED"), "true")),
		AutoUpdate:                parseBool(firstNonEmpty(values["AUTO_UPDATE"], os.Getenv("AUTO_UPDATE"), "true")),
		NameOverride:              firstNonEmpty(values["NAME_OVERRIDE"], os.Getenv("NAME_OVERRIDE")),
		StateFile:                 firstNonEmpty(values["STATE_FILE"], os.Getenv("STATE_FILE"), "/opt/pulseops-agent/state.json"),
		ReportIntervalSeconds:     parseInt(firstNonEmpty(values["REPORT_INTERVAL_SECONDS"], os.Getenv("REPORT_INTERVAL_SECONDS"), "300"), 300),
		JobPollIntervalSeconds:    parseInt(firstNonEmpty(values["JOB_POLL_INTERVAL_SECONDS"], os.Getenv("JOB_POLL_INTERVAL_SECONDS"), "10"), 10),
		AutoUpdateIntervalSeconds: parseInt(firstNonEmpty(values["AUTO_UPDATE_INTERVAL_SECONDS"], os.Getenv("AUTO_UPDATE_INTERVAL_SECONDS"), "900"), 900),
	}

	if cfg.ServerURL == "" {
		return Config{}, fmt.Errorf("missing SERVER_URL")
	}
	if cfg.EnrollmentToken == "" && path != "" {
		// The service can run with an empty enrollment token once state.json exists.
		cfg.EnrollmentToken = ""
	}

	return cfg, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func parseInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}
