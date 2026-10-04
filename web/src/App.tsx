import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import Live from "./pages/Live.js";
import OnDemand from "./pages/OnDemand.js";
import Search from "./pages/Search.js";
import Settings from "./pages/Settings.js";
import { fetchSettingsStatus } from "./api.js";
import Icon, { IconName } from "./ui/Icon.js";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/live", label: "Live TV", icon: "live" },
  { to: "/ondemand", label: "On Demand", icon: "film" },
  { to: "/search", label: "Search", icon: "search" },
];

function RailLink({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <NavLink to={to} className={({ isActive }) => `rail__link ${isActive ? "is-active" : ""}`}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function App() {
  const [defaultRoute, setDefaultRoute] = useState<string | null>(null);

  useEffect(() => {
    fetchSettingsStatus()
      .then((s) => setDefaultRoute(s.plex || s.silo || s.emby || s.xtream ? "/ondemand" : "/settings"))
      .catch(() => setDefaultRoute("/ondemand"));
  }, []);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Primary">
        <div className="rail__in">
          <NavLink to="/ondemand" className="rail__brand" aria-label="Unified Media Hub">
            <img src="/logo-mark.png" alt="" />
          </NavLink>
          {NAV.map((item) => (
            <RailLink key={item.to} {...item} />
          ))}
          <div className="rail__spacer" />
          <RailLink to="/settings" label="Settings" icon="settings" />
        </div>
      </nav>
      <main className="stage">
        <Routes>
          <Route path="/" element={defaultRoute ? <Navigate to={defaultRoute} replace /> : null} />
          <Route path="/live" element={<Live />} />
          <Route path="/ondemand" element={<OnDemand />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
