import { useEffect, useState } from "react";
import type { ServerPayload, ServerSummary } from "../types";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  initialServer?: ServerSummary | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: ServerPayload) => void;
};

const environmentOptions = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "internal", label: "Internal" },
  { value: "other", label: "Other" },
] as const;

export function ServerFormModal({
  open,
  mode,
  initialServer,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<ServerPayload["environment"]>("production");
  const [agentBaseUrl, setAgentBaseUrl] = useState("");
  const [agentToken, setAgentToken] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initialServer?.name ?? "");
    setEnvironment((initialServer?.environment as ServerPayload["environment"]) ?? "production");
    setAgentBaseUrl(initialServer?.agentBaseUrl ?? "");
    setAgentToken("");
    setNotes(initialServer?.notes ?? "");
    setIsActive(initialServer?.isActive ?? true);
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
            <p className="eyebrow">{mode === "create" ? "First steps" : "Server settings"}</p>
            <h3 id="server-modal-title">
              {mode === "create" ? "Ajouter un serveur" : "Modifier le serveur"}
            </h3>
          </div>
          <button className="ghost-button small" type="button" onClick={onClose}>
            Fermer
          </button>
        </div>

        <form
          className="server-form"
          onSubmit={(event) => {
            event.preventDefault();

            onSubmit({
              name,
              environment,
              agentBaseUrl,
              agentToken: agentToken || undefined,
              notes,
              isActive,
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
            <span>URL de l'agent</span>
            <input
              type="url"
              value={agentBaseUrl}
              onChange={(event) => setAgentBaseUrl(event.target.value)}
              placeholder="http://debian-node-01:4010"
              required
            />
          </label>

          <label>
            <span>{mode === "create" ? "Token agent" : "Nouveau token agent"}</span>
            <input
              type="password"
              value={agentToken}
              onChange={(event) => setAgentToken(event.target.value)}
              placeholder={mode === "edit" ? "Laisser vide pour conserver" : "Bearer secret"}
              required={mode === "create"}
            />
          </label>

          <label>
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Fenetre de maintenance, precision reseau, contact..."
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
              {pending ? "Enregistrement..." : mode === "create" ? "Ajouter" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
