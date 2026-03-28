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
      navigate("/", { replace: true });
    },
  });

  return (
    <div className="fullscreen-shell login-shell">
      <div className="login-panel">
        <div className="login-copy">
          <p className="eyebrow">Console Debian 13</p>
          <h1>PulseOps</h1>
          <p>Suivi simple des mises a jour et des serveurs Debian 13.</p>
          <div className="login-metrics">
            <article>
              <strong>Base vide</strong>
              <span>Aucune donnee de demo</span>
            </article>
            <article>
              <strong>Acces admin</strong>
              <span>Compte initialise au bootstrap</span>
            </article>
          </div>
        </div>

        <form
          className="login-card"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate();
          }}
        >
          <div>
            <p className="eyebrow">Connexion</p>
            <h2>Connexion admin</h2>
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
        </form>
      </div>
    </div>
  );
}
