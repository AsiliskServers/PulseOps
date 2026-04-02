import { useEffect, useState } from "react";
import type { ServerPayload, ServerSummary } from "../types";

type Props = {
  open: boolean;
  initialServer?: ServerSummary | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: ServerPayload) => void;
};

const environmentOptions = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "internal", label: "Interne" },
  { value: "other", label: "Autre" },
] as const;

export function ServerFormModal({
  open,
  initialServer,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<ServerPayload["environment"]>("production");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("22");

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initialServer?.name ?? "");
    setEnvironment((initialServer?.environment as ServerPayload["environment"]) ?? "production");
    setNotes(initialServer?.notes ?? "");
    setIsActive(initialServer?.isActive ?? true);
    setSshHost(initialServer?.sshHost ?? initialServer?.hostname ?? "");
    setSshPort(String(initialServer?.sshPort ?? 22));
  }, [initialServer, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Serveur</p>
            <h3 id="server-modal-title">Modifier le serveur</h3>
          </div>
          <button className="ghost-button small" type="button" onClick={onClose}>
            Fermer
          </button>
        </div>

        <form
          className="server-form"
          onSubmit={(event) => {
            event.preventDefault();

            const normalizedSshPort =
              sshPort.trim().length > 0 ? Number.parseInt(sshPort.trim(), 10) : undefined;

            onSubmit({
              name,
              environment,
              notes,
              isActive,
              sshHost: sshHost.trim() || undefined,
              sshPort: Number.isInteger(normalizedSshPort) ? normalizedSshPort : undefined,
            });
          }}
        >
          <label>
            <span>Nom du serveur</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>

          <label>
            <span>Environnement</span>
            <select
              value={environment}
              onChange={(event) =>
                setEnvironment(event.target.value as ServerPayload["environment"])
              }
            >
              {environmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Hote SSH / IP</span>
            <input
              value={sshHost}
              onChange={(event) => setSshHost(event.target.value)}
              placeholder="Ex: 192.168.2.101 ou srv-prod-01"
            />
          </label>

          <label>
            <span>Port SSH</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={sshPort}
              onChange={(event) => setSshPort(event.target.value)}
              placeholder="22"
            />
          </label>

          <label>
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Fenêtre de maintenance, précision réseau, contact..."
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            <span>Serveur actif dans l'interface</span>
          </label>

          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="primary-button" type="submit" disabled={pending}>
              {pending ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
