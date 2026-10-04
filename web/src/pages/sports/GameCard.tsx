import { Link } from "react-router-dom";
import { Channel, SportsGame, SportsTeam } from "../../api.js";
import Icon from "../../ui/Icon.js";
import SafeImg from "../../ui/SafeImg.js";
import "../sports.css";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function startLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return dayKey(d) === dayKey(new Date()) ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function TeamLine({ team, state }: { team: SportsTeam; state: SportsGame["state"] }) {
  const dim = state === "post" && team.winner === false;
  return (
    <div className={`team ${dim ? "is-dim" : ""}`}>
      <SafeImg src={team.logo} className="team__logo" fallback={<span className="team__logo team__logo--blank">{team.abbr}</span>} />
      <span className="team__name">
        {team.rank !== undefined && <span className="team__rank nums">{team.rank}</span>}
        {team.name}
      </span>
      {state === "pre" && team.record && <span className="team__record nums">{team.record}</span>}
      {state !== "pre" && <span className="team__score nums">{team.score ?? "–"}</span>}
    </div>
  );
}

interface GameCardProps {
  game: SportsGame;
  /** Channels that carry this game, best quality first. */
  channels: Channel[];
  /** When given, the Watch button plays in place instead of linking to Live TV. */
  onWatch?: (channel: Channel) => void;
}

/** Scoreboard card: teams, score or start time, network, odds and a button to the matching channel. */
export default function GameCard({ game, channels, onWatch }: GameCardProps) {
  const best = channels[0];
  const label = game.state === "post" ? "Replay channel" : game.state === "in" ? "Watch live" : "Open channel";
  const more = channels.length > 1 && <span className="game__more nums">+{channels.length - 1}</span>;
  return (
    <article className={`game ${game.state === "in" ? "is-live" : ""}`}>
      <header className="game__status">
        {game.state === "in" && <span className="tag tag--live">LIVE</span>}
        <span className={`game__detail nums ${game.state === "in" ? "is-live" : ""}`}>
          {game.state === "pre" ? startLabel(game.startTime) : game.detail}
        </span>
        {game.network && <span className="game__network">{game.network}</span>}
      </header>
      <div className="game__teams">
        <TeamLine team={game.away} state={game.state} />
        <TeamLine team={game.home} state={game.state} />
      </div>
      <footer className="game__foot">
        {game.odds && game.state !== "post" && <span className="game__odds nums">{game.odds}</span>}
        {best ? (
          onWatch ? (
            <button type="button" className={`btn btn--sm ${game.state === "in" ? "btn--primary" : ""}`} onClick={() => onWatch(best)}>
              <Icon name="play" size={16} />
              {label}
              {more}
            </button>
          ) : (
            <Link to={`/live?play=${best.id}`} className={`btn btn--sm ${game.state === "in" ? "btn--primary" : ""}`}>
              <Icon name="play" size={16} />
              {label}
              {more}
            </Link>
          )
        ) : (
          game.state !== "post" && <span className="game__none">No channel found</span>
        )}
      </footer>
    </article>
  );
}
