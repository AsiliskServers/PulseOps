package platform

import (
	"bufio"
	"os"
	"strings"
)

type Metadata struct {
	Hostname           string
	DisplayName        string
	AgentVersion       string
	OSName             string
	OSVersion          string
	ShellAccessEnabled bool
}

func CollectMetadata(version string, nameOverride string, shellAccessEnabled bool) (Metadata, error) {
	hostname, err := os.Hostname()
	if err != nil {
		return Metadata{}, err
	}

	osName, osVersion := readOSRelease()
	displayName := hostname
	if strings.TrimSpace(nameOverride) != "" {
		displayName = strings.TrimSpace(nameOverride)
	}

	return Metadata{
		Hostname:           hostname,
		DisplayName:        displayName,
		AgentVersion:       version,
		OSName:             osName,
		OSVersion:          osVersion,
		ShellAccessEnabled: shellAccessEnabled,
	}, nil
}

func readOSRelease() (string, string) {
	file, err := os.Open("/etc/os-release")
	if err != nil {
		return "debian", "unknown"
	}
	defer file.Close()

	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		values[parts[0]] = strings.Trim(parts[1], "\"")
	}

	if scanner.Err() != nil {
		return "debian", "unknown"
	}

	name := values["ID"]
	if name == "" {
		name = "debian"
	}
	version := values["VERSION_ID"]
	if version == "" {
		version = values["PRETTY_NAME"]
	}
	if version == "" {
		version = "unknown"
	}

	return name, version
}
