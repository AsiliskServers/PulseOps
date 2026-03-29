import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/overview", { replace: true });
    },
  });

  return (
    <div className="fullscreen-shell login-shell">
      <div className="login-panel">
        <aside className="login-aside">
          <div className="login-brand">
            <div className="brand-mark">P</div>
            <div>
              <p className="eyebrow">PulseOps</p>
              <h1>Administration</h1>
            </div>
          </div>

          <div className="login-copy">
            <p className="login-intro">Acces reserve a la console centrale.</p>
            <p className="login-subcopy">
              Authentifiez-vous pour gerer le parc Debian, les jobs APT et les retours agents.
            </p>
          </div>

          <div className="login-points">
            <article className="login-point">
              <strong>Acces securise</strong>
              <span>Session admin locale protegee par cookie.</span>
            </article>
            <article className="login-point">
              <strong>Parc central</strong>
              <span>Serveurs, snapshots et historique au meme endroit.</span>
            </article>
            <article className="login-point">
              <strong>Operations APT</strong>
              <span>Refresh, upgrade et suivi des executions.</span>
            </article>
          </div>
        </aside>

        <form
          className="login-card"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate();
          }}
        >
          <div className="login-form-header">
            <p className="eyebrow">Connexion</p>
            <h2>Espace administrateur</h2>
            <p className="login-helper">Saisissez les identifiants du compte initialise sur le serveur principal.</p>
          </div>

          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {loginMutation.isError ? (
            <div className="alert error">{loginMutation.error.message}</div>
          ) : null}

          <button className="primary-button wide" type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Connexion..." : "Se connecter"}
          </button>

          <p className="login-footer">Acces strictement reserve a l'administration PulseOps.</p>
        </form>
      </div>
    </div>
  );
}
