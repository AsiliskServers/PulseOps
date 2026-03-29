package platform

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

var ErrUpgradeDisabled = errors.New("upgrade is disabled on this agent")

type Summary struct {
	Reachable       bool      `json:"reachable"`
	UpgradableCount int       `json:"upgradableCount"`
	SecurityCount   int       `json:"securityCount"`
	RebootRequired  bool      `json:"rebootRequired"`
	CheckedAt       time.Time `json:"checkedAt"`
	OutputPreview   string    `json:"outputPreview"`
}

var securityPattern = regexp.MustCompile(`/[^ ]*security[^ ]*\s`)

func RunRefresh() (Summary, error) {
	_, err := runCommand("apt-get", "update")
	if err != nil {
		return Summary{}, err
	}

	listOutput, err := runCommand("apt", "list", "--upgradable")
	if err != nil {
		return Summary{}, err
	}

	upgradableCount, securityCount := parseUpgradableList(listOutput)

	return Summary{
		Reachable:       true,
		UpgradableCount: upgradableCount,
		SecurityCount:   securityCount,
		RebootRequired:  fileExists("/var/run/reboot-required"),
		CheckedAt:       time.Now().UTC(),
		OutputPreview:   buildUpgradablePreview(listOutput),
	}, nil
}

func RunUpgrade(allowUpgrade bool) (Summary, error) {
	if !allowUpgrade {
		return Summary{}, ErrUpgradeDisabled
	}

	_, err := runCommand("apt-get", "update")
	if err != nil {
		return Summary{}, err
	}

	_, err = runCommand("apt-get", "upgrade", "-y")
	if err != nil {
		return Summary{}, err
	}

	listOutput, err := runCommand("apt", "list", "--upgradable")
	if err != nil {
		return Summary{}, err
	}

	upgradableCount, securityCount := parseUpgradableList(listOutput)

	return Summary{
		Reachable:       true,
		UpgradableCount: upgradableCount,
		SecurityCount:   securityCount,
		RebootRequired:  fileExists("/var/run/reboot-required"),
		CheckedAt:       time.Now().UTC(),
		OutputPreview:   buildUpgradablePreview(listOutput),
	}, nil
}

func runCommand(command string, args ...string) (string, error) {
	cmd := exec.Command(command, args...)
	cmd.Env = append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("%s %s failed: %w\n%s", command, strings.Join(args, " "), err, stderr.String())
	}

	return strings.TrimSpace(stdout.String() + "\n" + stderr.String()), nil
}

func parseUpgradableList(output string) (int, int) {
	lines := extractUpgradableLines(output)
	securityCount := 0

	for _, line := range lines {
		if securityPattern.MatchString(line) {
			securityCount++
		}
	}

	return len(lines), securityCount
}

func extractUpgradableLines(output string) []string {
	lines := strings.Split(output, "\n")
	upgradableLines := make([]string, 0, len(lines))

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "Listing...") || strings.HasPrefix(trimmed, "WARNING:") {
			continue
		}

		if !strings.Contains(trimmed, "[upgradable from:") {
			continue
		}

		upgradableLines = append(upgradableLines, trimmed)
	}

	return upgradableLines
}

func buildUpgradablePreview(output string) string {
	lines := extractUpgradableLines(output)
	if len(lines) == 0 {
		return ""
	}

	return trimPreview(strings.Join(lines, "\n"))
}

func trimPreview(value string) string {
	const maxChars = 4000
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= maxChars {
		return trimmed
	}
	return trimmed[len(trimmed)-maxChars:]
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
