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
  { value: "internal", label: "Internal" },
  { value: "other", label: "Other" },
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

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initialServer?.name ?? "");
    setEnvironment((initialServer?.environment as ServerPayload["environment"]) ?? "production");
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
            <p className="eyebrow">Server settings</p>
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

            onSubmit({
              name,
              environment,
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
              {pending ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
