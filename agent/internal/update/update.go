package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Manifest struct {
	Version   string            `json:"version"`
	Assets    map[string]string `json:"assets"`
	Checksums map[string]string `json:"checksums"`
}

type asset struct {
	name     string
	checksum string
}

const maxAgentBinaryBytes = 100 * 1024 * 1024

func CheckAndApply(ctx context.Context, serverURL string, currentVersion string) (bool, string, error) {
	manifest, err := fetchManifest(ctx, strings.TrimRight(serverURL, "/")+"/downloads/latest.json")
	if err != nil {
		return false, "", err
	}

	if compareVersions(currentVersion, manifest.Version) >= 0 {
		return false, manifest.Version, nil
	}

	asset, err := resolveAsset(manifest)
	if err != nil {
		return false, manifest.Version, err
	}

	executablePath, err := os.Executable()
	if err != nil {
		return false, manifest.Version, err
	}

	if err := downloadReplacement(ctx, strings.TrimRight(serverURL, "/")+"/downloads/"+asset.name, executablePath, asset.checksum); err != nil {
		return false, manifest.Version, err
	}

	return true, manifest.Version, nil
}

func fetchManifest(ctx context.Context, url string) (Manifest, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Manifest{}, err
	}

	client := &http.Client{Timeout: 30 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return Manifest{}, err
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound {
		return Manifest{}, nil
	}

	if response.StatusCode >= 400 {
		body, _ := io.ReadAll(response.Body)
		return Manifest{}, fmt.Errorf("manifest request failed with status %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	var manifest Manifest
	if err := json.NewDecoder(response.Body).Decode(&manifest); err != nil {
		return Manifest{}, err
	}

	if manifest.Version == "" || len(manifest.Assets) == 0 {
		return Manifest{}, nil
	}

	return manifest, nil
}

func resolveAsset(manifest Manifest) (asset, error) {
	key := runtime.GOOS + "-" + runtime.GOARCH
	assetName := manifest.Assets[key]
	if assetName == "" {
		return asset{}, fmt.Errorf("no update asset available for %s", key)
	}

	if strings.ContainsAny(assetName, `/\`) || filepath.Base(assetName) != assetName {
		return asset{}, fmt.Errorf("invalid update asset name %q", assetName)
	}

	checksum := manifest.Checksums[assetName]
	if checksum == "" {
		return asset{}, fmt.Errorf("missing checksum for update asset %q", assetName)
	}

	if _, err := hex.DecodeString(checksum); err != nil {
		return asset{}, fmt.Errorf("invalid checksum for update asset %q", assetName)
	}

	return asset{
		name:     assetName,
		checksum: strings.ToLower(checksum),
	}, nil
}

func downloadReplacement(ctx context.Context, url string, executablePath string, expectedChecksum string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 2 * time.Minute}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		body, _ := io.ReadAll(response.Body)
		return fmt.Errorf("binary download failed with status %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	dir := filepath.Dir(executablePath)
	tempFile, err := os.CreateTemp(dir, "pulseops-agent-update-*")
	if err != nil {
		return err
	}

	tempPath := tempFile.Name()
	defer func() {
		_ = tempFile.Close()
		_ = os.Remove(tempPath)
	}()

	hasher := sha256.New()
	reader := io.LimitReader(response.Body, maxAgentBinaryBytes+1)
	written, err := io.Copy(io.MultiWriter(tempFile, hasher), reader)
	if err != nil {
		return err
	}

	if written > maxAgentBinaryBytes {
		return fmt.Errorf("binary download exceeds %d bytes", maxAgentBinaryBytes)
	}

	actualChecksum := hex.EncodeToString(hasher.Sum(nil))
	if actualChecksum != expectedChecksum {
		return fmt.Errorf("binary checksum mismatch: expected %s, got %s", expectedChecksum, actualChecksum)
	}

	if err := tempFile.Chmod(0o755); err != nil {
		return err
	}

	if err := tempFile.Close(); err != nil {
		return err
	}

	return os.Rename(tempPath, executablePath)
}

func compareVersions(current string, latest string) int {
	current = strings.TrimSpace(current)
	latest = strings.TrimSpace(latest)

	if current == latest {
		return 0
	}

	if currentNum, ok := parseLeadingInt(current); ok {
		if latestNum, ok := parseLeadingInt(latest); ok {
			switch {
			case currentNum < latestNum:
				return -1
			case currentNum > latestNum:
				return 1
			default:
				return strings.Compare(current, latest)
			}
		}
	}

	if currentSemver, ok := parseSemver(current); ok {
		if latestSemver, ok := parseSemver(latest); ok {
			for index := 0; index < len(currentSemver) || index < len(latestSemver); index++ {
				var currentPart int
				var latestPart int
				if index < len(currentSemver) {
					currentPart = currentSemver[index]
				}
				if index < len(latestSemver) {
					latestPart = latestSemver[index]
				}

				switch {
				case currentPart < latestPart:
					return -1
				case currentPart > latestPart:
					return 1
				}
			}
			return 0
		}
	}

	if _, ok := parseLeadingInt(latest); ok {
		return -1
	}

	if _, ok := parseSemver(latest); ok {
		return -1
	}

	return strings.Compare(current, latest)
}

func parseLeadingInt(value string) (int64, bool) {
	parts := strings.SplitN(value, "-", 2)
	if len(parts) == 0 {
		return 0, false
	}

	parsed, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, false
	}

	return parsed, true
}

func parseSemver(value string) ([]int, bool) {
	normalized := strings.TrimPrefix(value, "v")
	parts := strings.Split(normalized, ".")
	if len(parts) == 0 {
		return nil, false
	}

	result := make([]int, 0, len(parts))
	for _, part := range parts {
		parsed, err := strconv.Atoi(part)
		if err != nil {
			return nil, false
		}
		result = append(result, parsed)
	}

	return result, true
}
