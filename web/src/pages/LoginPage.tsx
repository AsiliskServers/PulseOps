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
      <div className="login-stack">
        <div className="login-mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div className="login-center-copy">
          <p className="eyebrow login-eyebrow">PulseOps</p>
          <h1>Connexion administrateur</h1>
          <p className="login-subcopy">
            Accedez a la console centrale et au pilotage des serveurs Debian.
          </p>
        </div>

        <form
          className="login-card minimal"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate();
          }}
        >
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@exemple.fr"
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
              placeholder="Votre mot de passe"
              required
            />
          </label>

          {loginMutation.isError ? (
            <div className="alert error">{loginMutation.error.message}</div>
          ) : null}

          <button className="primary-button wide login-submit" type="submit" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Connexion..." : "Continuer"}
          </button>

          <div className="login-divider">
            <span>Acces admin</span>
          </div>

          <p className="login-footer">Connexion reservee a l'administration PulseOps.</p>
        </form>
      </div>
    </div>
  );
}
