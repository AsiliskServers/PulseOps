package config

import (
	"bufio"
	"fmt"
	"net/url"
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

	reportInterval, err := parseConfigInt(
		"REPORT_INTERVAL_SECONDS",
		firstNonEmpty(values["REPORT_INTERVAL_SECONDS"], os.Getenv("REPORT_INTERVAL_SECONDS"), "300"),
	)
	if err != nil {
		return Config{}, err
	}

	pollInterval, err := parseConfigInt(
		"JOB_POLL_INTERVAL_SECONDS",
		firstNonEmpty(values["JOB_POLL_INTERVAL_SECONDS"], os.Getenv("JOB_POLL_INTERVAL_SECONDS"), "10"),
	)
	if err != nil {
		return Config{}, err
	}

	autoUpdateInterval, err := parseConfigInt(
		"AUTO_UPDATE_INTERVAL_SECONDS",
		firstNonEmpty(values["AUTO_UPDATE_INTERVAL_SECONDS"], os.Getenv("AUTO_UPDATE_INTERVAL_SECONDS"), "900"),
	)
	if err != nil {
		return Config{}, err
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
		ReportIntervalSeconds:     reportInterval,
		JobPollIntervalSeconds:    pollInterval,
		AutoUpdateIntervalSeconds: autoUpdateInterval,
	}

	if cfg.ServerURL == "" {
		return Config{}, fmt.Errorf("missing SERVER_URL")
	}
	if err := validateURL(cfg.ServerURL); err != nil {
		return Config{}, err
	}
	if !validEnvironment(cfg.Environment) {
		return Config{}, fmt.Errorf("invalid ENVIRONMENT %q", cfg.Environment)
	}
	if len(cfg.NameOverride) > 120 || strings.ContainsAny(cfg.NameOverride, "\r\n") {
		return Config{}, fmt.Errorf("NAME_OVERRIDE must be 120 characters or fewer and stay on one line")
	}
	if cfg.ReportIntervalSeconds < 30 || cfg.ReportIntervalSeconds > 86400 {
		return Config{}, fmt.Errorf("REPORT_INTERVAL_SECONDS must be between 30 and 86400")
	}
	if cfg.JobPollIntervalSeconds < 2 || cfg.JobPollIntervalSeconds > 3600 {
		return Config{}, fmt.Errorf("JOB_POLL_INTERVAL_SECONDS must be between 2 and 3600")
	}
	if cfg.AutoUpdateIntervalSeconds < 60 || cfg.AutoUpdateIntervalSeconds > 86400 {
		return Config{}, fmt.Errorf("AUTO_UPDATE_INTERVAL_SECONDS must be between 60 and 86400")
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

func validateURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return fmt.Errorf("SERVER_URL must be a valid HTTP(S) URL")
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("SERVER_URL must be a valid HTTP(S) URL")
	}

	if parsed.User != nil {
		return fmt.Errorf("SERVER_URL must not contain credentials")
	}

	return nil
}

func validEnvironment(value string) bool {
	switch value {
	case "production", "staging", "internal", "other":
		return true
	default:
		return false
	}
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func parseConfigInt(name string, value string) (int, error) {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", name)
	}
	return parsed, nil
}
