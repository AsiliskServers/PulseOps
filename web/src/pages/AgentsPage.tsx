import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEnrollmentSettings, rotateEnrollmentSettings } from "../api/settings";
import { getSummary, listServers } from "../api/servers";

export function AgentsPage() {
  const [copied, setCopied] = useState<"command" | "token" | null>(null);
  const queryClient = useQueryClient();

  const enrollmentQuery = useQuery({
    queryKey: ["enrollment"],
    queryFn: getEnrollmentSettings,
  });

  const summaryQuery = useQuery({
    queryKey: ["summary"],
    queryFn: getSummary,
    refetchInterval: 5000,
  });

  const serversQuery = useQuery({
    queryKey: ["servers"],
    queryFn: listServers,
    refetchInterval: 5000,
  });

  const rotateMutation = useMutation({
    mutationFn: rotateEnrollmentSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["enrollment"] });
    },
  });

  async function copyValue(value: string, kind: "command" | "token") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  const connectedServers =
    serversQuery.data?.filter((server) => server.connectivityStatus === "online").length ?? 0;

  return (
    <div className="page-column">
      <section className="page-header panel">
        <div className="page-heading">
          <p className="section-kicker">Agents</p>
          <h2>Installation et enrôlement</h2>
          <p className="page-copy">
            Prépare le token, copie la commande d&apos;installation et suis la couverture agent.
          </p>
        </div>
        <div className="page-header-side">
          <div className="hero-stat">
            <span>Agents en ligne</span>
            <strong>{connectedServers}</strong>
          </div>
          <div className="hero-stat">
            <span>Jobs en attente</span>
            <strong>{summaryQuery.data?.queuedJobCount ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="steps-grid">
        <article className="step-card">
          <span>1</span>
          <strong>Génère le token</strong>
          <p>Régénérer si besoin, puis copier la valeur courante.</p>
        </article>
        <article className="step-card">
          <span>2</span>
          <strong>Installe l&apos;agent</strong>
          <p>Exécute la commande sur la Debian 13 cible avec les bons paramètres.</p>
        </article>
        <article className="step-card">
          <span>3</span>
          <strong>Contrôle le retour</strong>
          <p>Le serveur apparaît ensuite dans le parc et remonte ses snapshots.</p>
        </article>
      </section>

      <section className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Token</p>
              <h3>Enrôlement</h3>
            </div>
            <button
              className="ghost-button small"
              type="button"
              onClick={() => rotateMutation.mutate()}
              disabled={rotateMutation.isPending}
            >
              {rotateMutation.isPending ? "Rotation..." : "Régénérer"}
            </button>
          </div>

          <div className="summary-list">
            <div className="summary-item">
              <span>URL publique</span>
              <strong>{enrollmentQuery.data?.publicUrl ?? "--"}</strong>
            </div>
            <div className="summary-item">
              <span>Rapport</span>
              <strong>
                {enrollmentQuery.data
                  ? `${enrollmentQuery.data.reportIntervalSeconds}s`
                  : "--"}
              </strong>
            </div>
            <div className="summary-item">
              <span>Polling</span>
              <strong>
                {enrollmentQuery.data
                  ? `${enrollmentQuery.data.jobPollIntervalSeconds}s`
                  : "--"}
              </strong>
            </div>
            <div className="summary-item">
              <span>MàJ agent</span>
              <strong>
                {enrollmentQuery.data
                  ? `${enrollmentQuery.data.autoUpdateIntervalSeconds}s`
                  : "--"}
              </strong>
            </div>
          </div>

          <div className="inline-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() =>
                enrollmentQuery.data &&
                void copyValue(enrollmentQuery.data.enrollmentToken, "token")
              }
              disabled={!enrollmentQuery.data}
            >
              {copied === "token" ? "Token copié" : "Copier le token"}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="section-kicker">Commande</p>
              <h3>Installation Debian 13</h3>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() =>
                enrollmentQuery.data &&
                void copyValue(enrollmentQuery.data.installCommand, "command")
              }
              disabled={!enrollmentQuery.data}
            >
              {copied === "command" ? "Commande copiée" : "Copier"}
            </button>
          </div>

          <pre>{enrollmentQuery.data?.installCommand ?? "Chargement..."}</pre>
        </section>
      </section>
    </div>
  );
}
