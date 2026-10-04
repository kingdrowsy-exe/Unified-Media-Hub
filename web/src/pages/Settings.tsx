import "./settings.css";
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
import { EmbyIcon, PlexIcon, SiloIcon, TmdbIcon, TraktIcon, XtreamIcon } from "../components/ServiceIcons.js";
import Icon from "../ui/Icon.js";

type ServiceId = "plex" | "silo" | "emby" | "xtream" | "tmdb" | "trakt";

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

function useSubmit<T extends unknown[]>(fn: (...args: T) => Promise<void>) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function run(e: React.FormEvent, ...args: T) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await fn(...args);
    } catch (err) {
      setError((err as Error).message || "Something went wrong. Check the details and try again.");
      setSaving(false);
    }
  }
  return { error, saving, run };
}

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
  const { error, saving, run } = useSubmit(onSubmit);

  return (
    <form className="st__form" onSubmit={(e) => run(e, baseUrl, username, password)}>
      <p className="st__help">{description}</p>
      <label className="st__field">
        Server URL
        <input
          className="input"
          type="text"
          placeholder="https://your-server.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
        />
      </label>
      <label className="st__field">
        Username
        <input className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </label>
      <label className="st__field">
        Password
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <div className="st__error">Couldn't connect: {error}</div>}
      <button type="submit" className="btn btn--primary" disabled={saving}>
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
  const { error, saving, run } = useSubmit(onSubmit);

  return (
    <form className="st__form" onSubmit={(e) => run(e, token)}>
      <p className="st__help">{description}</p>
      <label className="st__field">
        API Read Access Token
        <input
          className="input"
          type="text"
          placeholder={placeholder}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
      </label>
      {error && <div className="st__error">Couldn't connect: {error}</div>}
      <button type="submit" className="btn btn--primary" disabled={saving}>
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
  const { error, saving, run } = useSubmit(onSubmit);

  return (
    <form className="st__form" onSubmit={(e) => run(e, clientId, clientSecret)}>
      <p className="st__help">{description}</p>
      <label className="st__field">
        Client ID
        <input className="input" type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} required />
      </label>
      <label className="st__field">
        Client Secret
        <input
          className="input"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          required
        />
      </label>
      {error && <div className="st__error">Couldn't save: {error}</div>}
      <button type="submit" className="btn btn--primary" disabled={saving}>
        {saving ? "Checking…" : "Save"}
      </button>
    </form>
  );
}

function TestConnectionButton({ service }: { service: ServiceId }) {
  const [state, setState] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const resetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current) window.clearTimeout(resetRef.current);
    },
    [],
  );

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
    <div className="st__test">
      <button type="button" className="btn btn--sm" onClick={runTest} disabled={state === "testing"}>
        {state === "testing" ? "Testing…" : "Test connection"}
      </button>
      {state === "ok" && <span className="st__test-ok">Connection works.</span>}
      {state === "error" && <span className="st__test-err">{message ?? "The connection test failed."}</span>}
    </div>
  );
}

function ConnectedActions({ service, onDisconnect }: { service: ServiceId; onDisconnect: () => void }) {
  return (
    <div className="st__actions">
      <TestConnectionButton service={service} />
      <button type="button" className="btn btn--sm btn--quiet" onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}

function Drawer({
  name,
  logo,
  detail,
  onClose,
  children,
}: {
  name: string;
  logo: React.ReactNode;
  detail: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="st__backdrop" onClick={onClose} />
      <div className="st__drawer" role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} ref={ref}>
        <div className="st__drawer-head">
          {logo}
          <div className="st__names">
            <h2 className="h2">{name}</h2>
            <span className="muted">{detail}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="st__body">{children}</div>
      </div>
    </>
  );
}

function Card({
  logo,
  name,
  detail,
  connected,
  onOpen,
}: {
  logo: React.ReactNode;
  name: string;
  detail: string;
  connected: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="surface st__card">
      <div className="st__id">
        {logo}
        <div className="st__names">
          <h3 className="st__name">{name}</h3>
          <div className={`st__state ${connected ? "is-on" : ""}`}>
            <span className="st__dot" />
            <span>{detail}</span>
          </div>
        </div>
      </div>
      <button type="button" className={`btn ${connected ? "" : "btn--primary"}`} onClick={onOpen}>
        {connected ? "Manage" : "Connect"}
      </button>
    </div>
  );
}

function Logo({ color, id, children }: { color: string; id: ServiceId; children: React.ReactNode }) {
  return (
    <span className={`st__logo st__logo--${id}`} style={{ background: color }}>
      {children}
    </span>
  );
}

export default function Settings() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [open, setOpen] = useState<ServiceId | null>(null);
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

  async function beginPlexLink() {
    setOpen("plex");
    if (plexPollRef.current) window.clearInterval(plexPollRef.current);
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
    setOpen("trakt");
    if (traktPollRef.current) window.clearInterval(traktPollRef.current);
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

  const disconnect = (fn: () => Promise<unknown>) => () => {
    fn().then(refreshStatus);
  };

  const connectedCount = [status.plex, status.silo, status.emby, status.xtream, status.tmdb, status.trakt].filter(
    Boolean,
  ).length;

  const logos: Record<ServiceId, React.ReactNode> = {
    plex: (
      <Logo id="plex" color="#e5a00d">
        <PlexIcon />
      </Logo>
    ),
    silo: (
      <Logo id="silo" color="#2dd4bf">
        <SiloIcon />
      </Logo>
    ),
    emby: (
      <Logo id="emby" color="#52b54b">
        <EmbyIcon />
      </Logo>
    ),
    xtream: (
      <Logo id="xtream" color="var(--accent)">
        <XtreamIcon />
      </Logo>
    ),
    tmdb: (
      <Logo id="tmdb" color="#01d277">
        <TmdbIcon />
      </Logo>
    ),
    trakt: (
      <Logo id="trakt" color="#ed1c24">
        <TraktIcon />
      </Logo>
    ),
  };

  const info: Record<ServiceId, { name: string; connected: boolean; detail: string }> = {
    plex: {
      name: "Plex",
      connected: status.plex,
      detail: status.plex ? status.plexServerName ?? "Connected" : "Not connected",
    },
    silo: {
      name: "Silo",
      connected: status.silo,
      detail: status.silo ? status.siloBaseUrl ?? "Connected" : "Not connected",
    },
    emby: {
      name: "Emby",
      connected: status.emby,
      detail: status.emby ? status.embyBaseUrl ?? "Connected" : "Not connected",
    },
    xtream: {
      name: "Xtream Codes",
      connected: status.xtream,
      detail: status.xtream ? status.xtreamBaseUrl ?? "Connected" : "Not connected",
    },
    tmdb: { name: "TMDB", connected: status.tmdb, detail: status.tmdb ? "Connected" : "Not connected" },
    trakt: {
      name: "Trakt",
      connected: status.trakt,
      detail: status.trakt ? "Connected" : status.traktConfigured ? "Not linked yet" : "Not connected",
    },
  };

  const groups: { title: string; ids: ServiceId[] }[] = [
    { title: "Media servers", ids: ["plex", "silo", "emby"] },
    { title: "Live TV", ids: ["xtream"] },
    { title: "Metadata", ids: ["tmdb", "trakt"] },
  ];

  function closeDrawer() {
    setOpen(null);
  }

  function renderBody(id: ServiceId): React.ReactNode {
    switch (id) {
      case "plex":
        if (status!.plex) return <ConnectedActions service="plex" onDisconnect={disconnect(disconnectPlex)} />;
        if (plexLink.phase === "waiting") {
          return plexLink.code ? (
            <>
              <ol className="st__steps">
                <li>
                  <span>
                    Open{" "}
                    <a href="https://plex.tv/link" target="_blank" rel="noreferrer">
                      plex.tv/link
                    </a>{" "}
                    on any device.
                  </span>
                </li>
                <li>
                  <span>Enter this code when asked.</span>
                </li>
              </ol>
              <div className="st__code">{plexLink.code}</div>
              <div className="st__wait">
                <i /> Waiting for you to authorize…
              </div>
            </>
          ) : (
            <div className="st__wait">
              <i /> Starting link request…
            </div>
          );
        }
        return (
          <>
            <p className="st__help">
              Link your Plex account the same way you would on a TV. There is no token to copy.
            </p>
            {plexLink.phase === "error" && <div className="st__error">Couldn't link Plex: {plexLink.message}</div>}
            <button type="button" className="btn btn--primary" onClick={beginPlexLink}>
              {plexLink.phase === "error" ? "Try again" : "Link Plex account"}
            </button>
          </>
        );
      case "silo":
        return status!.silo ? (
          <>
            <p className="st__help">Movies from Silo appear in On Demand. TV shows aren't supported yet.</p>
            <ConnectedActions service="silo" onDisconnect={disconnect(disconnectSilo)} />
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
        );
      case "emby":
        return status!.emby ? (
          <ConnectedActions service="emby" onDisconnect={disconnect(disconnectEmby)} />
        ) : (
          <CredentialForm
            title="Emby"
            description="Log in with your Emby account."
            onSubmit={async (baseUrl, username, password) => {
              await saveEmby(baseUrl, username, password);
              refreshStatus();
            }}
          />
        );
      case "xtream":
        return status!.xtream ? (
          <ConnectedActions service="xtream" onDisconnect={disconnect(disconnectXtream)} />
        ) : (
          <CredentialForm
            title="Xtream Codes"
            description="Log in with the credentials your IPTV provider gave you."
            onSubmit={async (baseUrl, username, password) => {
              await saveXtream(baseUrl, username, password);
              refreshStatus();
            }}
          />
        );
      case "tmdb":
        return status!.tmdb ? (
          <>
            <p className="st__help">Powers the Popular Movies and Popular Shows shelves on On Demand.</p>
            <ConnectedActions service="tmdb" onDisconnect={disconnect(disconnectTmdb)} />
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
        );
      case "trakt":
        if (status!.trakt) {
          return (
            <>
              <p className="st__help">
                Adds Trakt ratings and reviews to the detail page, plus your Watchlist and personal recommendations as
                shelves on On Demand.
              </p>
              <ConnectedActions service="trakt" onDisconnect={disconnect(disconnectTrakt)} />
            </>
          );
        }
        if (!status!.traktConfigured) {
          return (
            <ClientCredentialForm
              description="Register a free API app at trakt.tv/oauth/applications (redirect URI urn:ietf:wg:oauth:2.0:oob), then paste its Client ID and Secret here."
              onSubmit={async (clientId, clientSecret) => {
                await saveTrakt(clientId, clientSecret);
                refreshStatus();
              }}
            />
          );
        }
        if (traktLink.phase === "waiting") {
          return traktLink.userCode ? (
            <>
              <ol className="st__steps">
                <li>
                  <span>
                    Open{" "}
                    <a href={traktLink.verificationUrl || "https://trakt.tv/activate"} target="_blank" rel="noreferrer">
                      {traktLink.verificationUrl || "trakt.tv/activate"}
                    </a>{" "}
                    on any device.
                  </span>
                </li>
                <li>
                  <span>Enter this code when asked.</span>
                </li>
              </ol>
              <div className="st__code">{traktLink.userCode}</div>
              <div className="st__wait">
                <i /> Waiting for you to authorize…
              </div>
            </>
          ) : (
            <div className="st__wait">
              <i /> Starting link request…
            </div>
          );
        }
        return (
          <>
            <p className="st__help">Client ID and Secret saved. Now link your Trakt account.</p>
            {traktLink.phase === "error" && <div className="st__error">Couldn't link Trakt: {traktLink.message}</div>}
            <div className="st__actions">
              <button type="button" className="btn btn--primary" onClick={beginTraktLink}>
                {traktLink.phase === "error" ? "Try again" : "Link Trakt account"}
              </button>
              <button type="button" className="btn btn--quiet" onClick={disconnect(disconnectTrakt)}>
                Start over
              </button>
            </div>
          </>
        );
    }
  }

  return (
    <div className="page st">
      <header className="st__head">
        <h1 className="h1">Settings</h1>
        <p className="muted">
          {connectedCount} of 6 services connected
        </p>
      </header>

      {groups.map((g) => (
        <section className="st__group" key={g.title}>
          <h2 className="h2 st__group-title">{g.title}</h2>
          <div className="st__grid">
            {g.ids.map((id) => (
              <Card
                key={id}
                logo={logos[id]}
                name={info[id].name}
                detail={info[id].detail}
                connected={info[id].connected}
                onOpen={() => setOpen(id)}
              />
            ))}
          </div>
        </section>
      ))}

      {open && (
        <Drawer
          key={open}
          name={info[open].name}
          logo={logos[open]}
          detail={info[open].detail}
          onClose={closeDrawer}
        >
          {renderBody(open)}
        </Drawer>
      )}
    </div>
  );
}
