import { useEffect, useRef, useState } from "react";
import {
  SettingsStatus,
  disconnectEmby,
  disconnectPlex,
  disconnectSilo,
  disconnectTmdb,
  disconnectTrakt,
  disconnectXtream,
  fetchSettingsStatus,
  pollPlexLink,
  pollTraktLink,
  saveEmby,
  saveSilo,
  saveTmdb,
  saveTrakt,
  saveXtream,
  startPlexLink,
  startTraktLink,
  testConnection,
} from "../api.js";

type PlexLinkState =
  | { phase: "idle" }
  | { phase: "waiting"; code: string; pinId: number }
  | { phase: "error"; message: string };

type TraktLinkState =
  | { phase: "idle" }
  | { phase: "waiting"; userCode: string; verificationUrl: string }
  | { phase: "error"; message: string };

const PLEX_LINK_TIMEOUT_MS = 10 * 60 * 1000;
const TRAKT_LINK_TIMEOUT_MS = 10 * 60 * 1000;

type CategoryId = "servers" | "livetv" | "metadata";

function CredentialForm({
  title,
  description,
  onSubmit,
}: {
  title: string;
  description: string;
  onSubmit: (baseUrl: string, username: string, password: string) => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(baseUrl, username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <p className="settings-desc">{description}</p>
      <label>
        Server URL
        <input
          type="text"
          placeholder="https://your-server.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
        />
      </label>
      <label>
        Username
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <div className="settings-error">{error}</div>}
      <button type="submit" disabled={saving}>
        {saving ? "Connecting…" : `Log in to ${title}`}
      </button>
    </form>
  );
}

function TokenForm({
  description,
  placeholder,
  buttonLabel,
  onSubmit,
}: {
  description: string;
  placeholder: string;
  buttonLabel: string;
  onSubmit: (token: string) => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <p className="settings-desc">{description}</p>
      <label>
        API Read Access Token
        <input type="text" placeholder={placeholder} value={token} onChange={(e) => setToken(e.target.value)} required />
      </label>
      {error && <div className="settings-error">{error}</div>}
      <button type="submit" disabled={saving}>
        {saving ? "Connecting…" : buttonLabel}
      </button>
    </form>
  );
}

function ClientCredentialForm({
  description,
  onSubmit,
}: {
  description: string;
  onSubmit: (clientId: string, clientSecret: string) => Promise<void>;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(clientId, clientSecret);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <p className="settings-desc">{description}</p>
      <label>
        Client ID
        <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
      </label>
      <label>
        Client Secret
        <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} required />
      </label>
      {error && <div className="settings-error">{error}</div>}
      <button type="submit" disabled={saving}>
        {saving ? "Checking…" : "Save"}
      </button>
    </form>
  );
}

function TestConnectionButton({ service }: { service: "plex" | "silo" | "emby" | "xtream" | "tmdb" | "trakt" }) {
  const [state, setState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const resetRef = useRef<number | null>(null);

  async function runTest() {
    setState("testing");
    setMessage(null);
    if (resetRef.current) window.clearTimeout(resetRef.current);
    try {
      await testConnection(service);
      setState("ok");
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
    resetRef.current = window.setTimeout(() => setState("idle"), 5000);
  }

  return (
    <div className="test-connection">
      <button className="secondary" onClick={runTest} disabled={state === "testing"}>
        {state === "testing" ? "Testing…" : "Test Connection"}
      </button>
      {state === "ok" && <span className="test-connection-ok">Working</span>}
      {state === "error" && <span className="test-connection-error">{message ?? "Failed"}</span>}
    </div>
  );
}

function SettingsRow({
  letter,
  color,
  name,
  subtitle,
  connected,
  expanded,
  onToggle,
  children,
}: {
  letter: string;
  color: string;
  name: string;
  subtitle: string;
  connected: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`settings-row ${expanded ? "expanded" : ""}`}>
      <button type="button" className="settings-row-header" onClick={onToggle}>
        <span className="settings-row-icon" style={{ background: color }}>
          {letter}
        </span>
        <span className="settings-row-title">
          <span className="settings-row-name">{name}</span>
          <span className={`settings-row-subtitle ${connected ? "is-connected" : ""}`}>
            {connected && <span className="status-dot" />}
            {subtitle}
          </span>
        </span>
        <svg className="settings-row-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {expanded && <div className="settings-row-body">{children}</div>}
    </div>
  );
}

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "servers", label: "Media Servers" },
  { id: "livetv", label: "Live TV" },
  { id: "metadata", label: "Metadata & Ratings" },
];

export default function Settings() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [category, setCategory] = useState<CategoryId>("servers");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [plexLink, setPlexLink] = useState<PlexLinkState>({ phase: "idle" });
  const [traktLink, setTraktLink] = useState<TraktLinkState>({ phase: "idle" });
  const plexPollRef = useRef<number | null>(null);
  const traktPollRef = useRef<number | null>(null);

  function refreshStatus() {
    fetchSettingsStatus().then(setStatus);
  }

  useEffect(() => {
    refreshStatus();
    return () => {
      if (plexPollRef.current) window.clearInterval(plexPollRef.current);
      if (traktPollRef.current) window.clearInterval(traktPollRef.current);
    };
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function beginPlexLink() {
    setPlexLink({ phase: "waiting", code: "", pinId: 0 });
    try {
      const { pinId, code } = await startPlexLink();
      setPlexLink({ phase: "waiting", code, pinId });

      // Plex pins expire server-side anyway, but don't poll plex.tv forever if someone
      // starts linking and then walks away without ever finishing the plex.tv/link step.
      const deadline = Date.now() + PLEX_LINK_TIMEOUT_MS;

      plexPollRef.current = window.setInterval(async () => {
        if (Date.now() > deadline) {
          if (plexPollRef.current) window.clearInterval(plexPollRef.current);
          setPlexLink({ phase: "error", message: "Link request timed out. Try again." });
          return;
        }
        try {
          const result = await pollPlexLink(pinId);
          if (result.linked) {
            if (plexPollRef.current) window.clearInterval(plexPollRef.current);
            setPlexLink({ phase: "idle" });
            refreshStatus();
          }
        } catch (err) {
          if (plexPollRef.current) window.clearInterval(plexPollRef.current);
          setPlexLink({ phase: "error", message: (err as Error).message });
        }
      }, 2000);
    } catch (err) {
      setPlexLink({ phase: "error", message: (err as Error).message });
    }
  }

  async function beginTraktLink() {
    setTraktLink({ phase: "waiting", userCode: "", verificationUrl: "" });
    try {
      const { userCode, verificationUrl, interval } = await startTraktLink();
      setTraktLink({ phase: "waiting", userCode, verificationUrl });

      const deadline = Date.now() + TRAKT_LINK_TIMEOUT_MS;

      traktPollRef.current = window.setInterval(async () => {
        if (Date.now() > deadline) {
          if (traktPollRef.current) window.clearInterval(traktPollRef.current);
          setTraktLink({ phase: "error", message: "Link request timed out. Try again." });
          return;
        }
        try {
          const result = await pollTraktLink();
          if (result.linked) {
            if (traktPollRef.current) window.clearInterval(traktPollRef.current);
            setTraktLink({ phase: "idle" });
            refreshStatus();
          }
        } catch (err) {
          if (traktPollRef.current) window.clearInterval(traktPollRef.current);
          setTraktLink({ phase: "error", message: (err as Error).message });
        }
      }, Math.max(interval, 3) * 1000);
    } catch (err) {
      setTraktLink({ phase: "error", message: (err as Error).message });
    }
  }

  if (!status) {
    return <div className="page status">Loading settings…</div>;
  }

  const counts: Record<CategoryId, { connected: number; total: number }> = {
    servers: { connected: [status.plex, status.silo, status.emby].filter(Boolean).length, total: 3 },
    livetv: { connected: status.xtream ? 1 : 0, total: 1 },
    metadata: { connected: [status.tmdb, status.trakt].filter(Boolean).length, total: 2 },
  };

  return (
    <div className="page settings-page">
      <div className="settings-hero">
        <h1 className="settings-heading">Settings</h1>
        <p className="settings-subheading">Connect your media servers, IPTV provider, and metadata sources.</p>
      </div>

      <div className="settings-shell">
        <nav className="settings-nav">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`settings-nav-item ${category === c.id ? "active" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              <span>{c.label}</span>
              <span className="settings-nav-count">
                {counts[c.id].connected}/{counts[c.id].total}
              </span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {category === "servers" && (
            <>
              <SettingsRow
                letter="P"
                color="var(--plex-color)"
                name="Plex"
                subtitle={status.plex ? status.plexServerName ?? "Connected" : "Not connected"}
                connected={status.plex}
                expanded={!!expanded.plex || plexLink.phase !== "idle"}
                onToggle={() => toggle("plex")}
              >
                {status.plex ? (
                  <div className="settings-actions">
                    <TestConnectionButton service="plex" />
                    <button className="secondary" onClick={() => disconnectPlex().then(refreshStatus)}>
                      Disconnect
                    </button>
                  </div>
                ) : plexLink.phase === "waiting" ? (
                  <div className="plex-link">
                    {plexLink.code ? (
                      <>
                        <p>
                          1. Open <a href="https://plex.tv/link" target="_blank" rel="noreferrer">plex.tv/link</a>
                        </p>
                        <p>
                          2. Enter this code: <strong className="link-code">{plexLink.code}</strong>
                        </p>
                        <p className="settings-desc">Waiting for you to authorize…</p>
                      </>
                    ) : (
                      <p className="settings-desc">Starting link request…</p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="settings-desc">
                      Connect your Plex account — no token to copy, just link it like any other Plex app.
                    </p>
                    <button onClick={beginPlexLink}>Link Plex Account</button>
                  </>
                )}
                {plexLink.phase === "error" && <div className="settings-error">{plexLink.message}</div>}
              </SettingsRow>

              <SettingsRow
                letter="S"
                color="var(--silo-color)"
                name="Silo"
                subtitle={status.silo ? status.siloBaseUrl ?? "Connected" : "Not connected"}
                connected={status.silo}
                expanded={!!expanded.silo}
                onToggle={() => toggle("silo")}
              >
                {status.silo ? (
                  <>
                    <p className="settings-desc">Movies from Silo appear in On Demand. TV shows aren't supported yet.</p>
                    <div className="settings-actions">
                      <TestConnectionButton service="silo" />
                      <button className="secondary" onClick={() => disconnectSilo().then(refreshStatus)}>
                        Disconnect
                      </button>
                    </div>
                  </>
                ) : (
                  <CredentialForm
                    title="Silo"
                    description="Log in with your Silo (Jellyfin/Emby-compatible) account."
                    onSubmit={async (baseUrl, username, password) => {
                      await saveSilo(baseUrl, username, password);
                      refreshStatus();
                    }}
                  />
                )}
              </SettingsRow>

              <SettingsRow
                letter="E"
                color="var(--emby-color)"
                name="Emby"
                subtitle={status.emby ? status.embyBaseUrl ?? "Connected" : "Not connected"}
                connected={status.emby}
                expanded={!!expanded.emby}
                onToggle={() => toggle("emby")}
              >
                {status.emby ? (
                  <div className="settings-actions">
                    <TestConnectionButton service="emby" />
                    <button className="secondary" onClick={() => disconnectEmby().then(refreshStatus)}>
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <CredentialForm
                    title="Emby"
                    description="Log in with your Emby account."
                    onSubmit={async (baseUrl, username, password) => {
                      await saveEmby(baseUrl, username, password);
                      refreshStatus();
                    }}
                  />
                )}
              </SettingsRow>
            </>
          )}

          {category === "livetv" && (
            <SettingsRow
              letter="X"
              color="var(--accent-2)"
              name="Xtream Codes IPTV"
              subtitle={status.xtream ? status.xtreamBaseUrl ?? "Connected" : "Not connected"}
              connected={status.xtream}
              expanded={!!expanded.xtream}
              onToggle={() => toggle("xtream")}
            >
              {status.xtream ? (
                <div className="settings-actions">
                  <TestConnectionButton service="xtream" />
                  <button className="secondary" onClick={() => disconnectXtream().then(refreshStatus)}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <CredentialForm
                  title="Xtream Codes"
                  description="Log in with the credentials your IPTV provider gave you."
                  onSubmit={async (baseUrl, username, password) => {
                    await saveXtream(baseUrl, username, password);
                    refreshStatus();
                  }}
                />
              )}
            </SettingsRow>
          )}

          {category === "metadata" && (
            <>
              <SettingsRow
                letter="T"
                color="#01d277"
                name="TMDB"
                subtitle={status.tmdb ? "Connected" : "Not connected"}
                connected={status.tmdb}
                expanded={!!expanded.tmdb}
                onToggle={() => toggle("tmdb")}
              >
                {status.tmdb ? (
                  <>
                    <p className="settings-desc">Powers the Popular Movies and Popular Shows shelves on On Demand.</p>
                    <div className="settings-actions">
                      <TestConnectionButton service="tmdb" />
                      <button className="secondary" onClick={() => disconnectTmdb().then(refreshStatus)}>
                        Disconnect
                      </button>
                    </div>
                  </>
                ) : (
                  <TokenForm
                    description="Paste your TMDB API Read Access Token (free at themoviedb.org/settings/api) to power the Popular Movies and Popular Shows shelves."
                    placeholder="eyJhbGciOi..."
                    buttonLabel="Connect TMDB"
                    onSubmit={async (token) => {
                      await saveTmdb(token);
                      refreshStatus();
                    }}
                  />
                )}
              </SettingsRow>

              <SettingsRow
                letter="T"
                color="#ed1c24"
                name="Trakt"
                subtitle={status.trakt ? "Connected" : status.traktConfigured ? "Not linked" : "Not connected"}
                connected={status.trakt}
                expanded={!!expanded.trakt || traktLink.phase !== "idle"}
                onToggle={() => toggle("trakt")}
              >
                {status.trakt ? (
                  <>
                    <p className="settings-desc">
                      Adds Trakt ratings and reviews to the detail page, plus your Watchlist and personal
                      recommendations as shelves on On Demand.
                    </p>
                    <div className="settings-actions">
                      <TestConnectionButton service="trakt" />
                      <button className="secondary" onClick={() => disconnectTrakt().then(refreshStatus)}>
                        Disconnect
                      </button>
                    </div>
                  </>
                ) : status.traktConfigured ? (
                  traktLink.phase === "waiting" ? (
                    <div className="plex-link">
                      {traktLink.userCode ? (
                        <>
                          <p>
                            1. Open{" "}
                            <a href={traktLink.verificationUrl || "https://trakt.tv/activate"} target="_blank" rel="noreferrer">
                              {traktLink.verificationUrl || "trakt.tv/activate"}
                            </a>
                          </p>
                          <p>
                            2. Enter this code: <strong className="link-code">{traktLink.userCode}</strong>
                          </p>
                          <p className="settings-desc">Waiting for you to authorize…</p>
                        </>
                      ) : (
                        <p className="settings-desc">Starting link request…</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="settings-desc">Client ID and Secret saved. Now link your Trakt account.</p>
                      <div className="settings-actions">
                        <button onClick={beginTraktLink}>Link Trakt Account</button>
                        <button className="secondary" onClick={() => disconnectTrakt().then(refreshStatus)}>
                          Start Over
                        </button>
                      </div>
                    </>
                  )
                ) : (
                  <ClientCredentialForm
                    description={
                      "Register a free API app at trakt.tv/oauth/applications (redirect URI urn:ietf:wg:oauth:2.0:oob), then paste its Client ID and Secret here."
                    }
                    onSubmit={async (clientId, clientSecret) => {
                      await saveTrakt(clientId, clientSecret);
                      refreshStatus();
                    }}
                  />
                )}
                {traktLink.phase === "error" && <div className="settings-error">{traktLink.message}</div>}
              </SettingsRow>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
