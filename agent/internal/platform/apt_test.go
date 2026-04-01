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

func TestParseUpgradableListSupportsFrenchAptOutput(t *testing.T) {
	output := `libpng16-16t64/stable-security 1.6.48-1+deb13u4 amd64 [pouvant être mis à jour depuis : 1.6.48-1+deb13u3]
Notification : Il y a une version supplémentaire 1. Veuillez utiliser l'opérande « -a » pour la voir.`

	upgradableCount, securityCount := parseUpgradableList(output)

	if upgradableCount != 1 {
		t.Fatalf("expected 1 upgradable package, got %d", upgradableCount)
	}

	if securityCount != 1 {
		t.Fatalf("expected 1 security package, got %d", securityCount)
	}
}
