import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import Live from "./pages/Live.js";
import OnDemand from "./pages/OnDemand.js";
import Search from "./pages/Search.js";
import Settings from "./pages/Settings.js";
import { fetchSettingsStatus } from "./api.js";

const NAV = [
  {
    to: "/live",
    label: "Live TV",
    icon: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" />
      </>
    ),
  },
  {
    to: "/ondemand",
    label: "On Demand",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M10 9.5v5l4.5-2.5z" />
      </>
    ),
  },
  {
    to: "/search",
    label: "Search",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-5-5" />
      </>
    ),
  },
];

export default function App() {
  const [defaultRoute, setDefaultRoute] = useState<string | null>(null);

  useEffect(() => {
    fetchSettingsStatus()
      .then((status) => {
        const anyConfigured = status.plex || status.silo || status.emby || status.xtream;
        setDefaultRoute(anyConfigured ? "/ondemand" : "/settings");
      })
      .catch(() => setDefaultRoute("/ondemand"));
  }, []);

  return (
    <div className="app-shell">
      <nav className="rail" aria-label="Primary">
        <div className="rail-in">
          <NavLink to="/ondemand" className="rail-brand" aria-label="Unified Media Hub">
            <img src="/logo.svg" alt="" width={24} height={24} />
            <b>Unified Hub</b>
          </NavLink>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `rail-link ${isActive ? "active" : ""}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg>
              <span>{item.label}</span>
            </NavLink>
          ))}
          <div className="rail-spacer" />
          <NavLink to="/settings" className={({ isActive }) => `rail-link ${isActive ? "active" : ""}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="8" cy="17" r="2" />
            </svg>
            <span>Settings</span>
          </NavLink>
        </div>
      </nav>
      <div className="app-routes">
        <Routes>
          <Route
            path="/"
            element={defaultRoute ? <Navigate to={defaultRoute} replace /> : null}
          />
          <Route path="/live" element={<Live />} />
          <Route path="/ondemand" element={<OnDemand />} />
          <Route path="/search" element={<Search />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}
