import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import Live from "./pages/Live.js";
import OnDemand from "./pages/OnDemand.js";
import Search from "./pages/Search.js";
import Sports from "./pages/Sports.js";
import Settings from "./pages/Settings.js";
import { fetchSettingsStatus } from "./api.js";
import Icon, { IconName } from "./ui/Icon.js";
import { PlayerProvider } from "./player/PlayerProvider.js";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/live", label: "Live TV", icon: "live" },
  { to: "/sports", label: "Sports", icon: "trophy" },
  { to: "/ondemand", label: "On Demand", icon: "film" },
  { to: "/search", label: "Search", icon: "search" },
];

function RailLink({ to, label, icon, onNavigate }: { to: string; label: string; icon: IconName; onNavigate: () => void }) {
  return (
    <NavLink to={to} className={({ isActive }) => `rail__link ${isActive ? "is-active" : ""}`} onClick={onNavigate}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function App() {
  const [defaultRoute, setDefaultRoute] = useState<string | null>(null);
  // After a click the rail folds away even though the pointer is still over it; it re-arms once the pointer leaves.
  const [folded, setFolded] = useState(false);
  const fold = () => {
    setFolded(true);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  useEffect(() => {
    fetchSettingsStatus()
      .then((s) => setDefaultRoute(s.plex || s.silo || s.emby || s.xtream ? "/ondemand" : "/settings"))
      .catch(() => setDefaultRoute("/ondemand"));
  }, []);

  return (
    <PlayerProvider>
    <div className="shell">
      <nav className={`rail ${folded ? "is-folded" : ""}`} aria-label="Primary" onMouseLeave={() => setFolded(false)}>
        <div className="rail__in">
          <NavLink to="/ondemand" className="rail__brand" aria-label="Unified Media Hub" onClick={fold}>
            <img src="/logo-mark.png" alt="" />
          </NavLink>
          {NAV.map((item) => (
            <RailLink key={item.to} {...item} onNavigate={fold} />
          ))}
          <div className="rail__spacer" />
          <RailLink to="/settings" label="Settings" icon="settings" onNavigate={fold} />
        </div>
      </nav>
      <main className="stage">
        <Routes>
          <Route path="/" element={defaultRoute ? <Navigate to={defaultRoute} replace /> : null} />
          <Route path="/live" element={<Live />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/ondemand" element={<OnDemand />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
    </PlayerProvider>
  );
}
