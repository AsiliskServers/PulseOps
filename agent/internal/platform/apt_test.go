package platform

import "testing"

func TestParseUpgradableListIgnoresWarningAndListing(t *testing.T) {
	output := `WARNING: apt does not have a stable CLI interface. Use with caution in scripts.

Listing...`

	upgradableCount, securityCount := parseUpgradableList(output)

	if upgradableCount != 0 {
		t.Fatalf("expected 0 upgradable packages, got %d", upgradableCount)
	}

	if securityCount != 0 {
		t.Fatalf("expected 0 security packages, got %d", securityCount)
	}
}

func TestParseUpgradableListCountsOnlyRealPackages(t *testing.T) {
	output := `Listing...
openssl/stable-security 3.0.17-1 amd64 [upgradable from: 3.0.16-1]
curl/stable 8.14.1-2 amd64 [upgradable from: 8.14.1-1]
Tous les paquets sont a jour.`

	upgradableCount, securityCount := parseUpgradableList(output)

	if upgradableCount != 2 {
		t.Fatalf("expected 2 upgradable packages, got %d", upgradableCount)
	}

	if securityCount != 1 {
		t.Fatalf("expected 1 security package, got %d", securityCount)
	}
}
