import { useEffect, useMemo, useState } from "react";
import { CategoryGroup } from "../../utils/categoryGroups.js";
import { compareAlpha } from "../../utils/alpha.js";
import { CategoryType, categoryType, leagueLogoFor } from "../../utils/leagueLogos.js";
import Icon from "../../ui/Icon.js";
import SafeImg from "../../ui/SafeImg.js";

interface SubCategoryGridProps {
  group: CategoryGroup;
  counts: Map<string, number>;
  /** Up to three channel logos per full category name; used when there is no league mark. */
  logos: Map<string, string[]>;
  total: number;
  /** Full category names the user pinned. */
  pinned: string[];
  onTogglePin: (category: string) => void;
  onPick: (category: string) => void;
  onShowAll: () => void;
}

type Cat = { name: string; label: string };
type Sort = "az" | "count";
type View = "tiles" | "list";

const TYPES: CategoryType[] = ["Leagues", "College", "Streaming", "Teams", "Replays"];
const JUMP_MIN = 24;

function letterOf(label: string): string {
  return /^[A-Za-z]/.test(label) ? label[0].toUpperCase() : "#";
}

function readView(): View {
  try {
    return localStorage.getItem("umh.catView") === "list" ? "list" : "tiles";
  } catch {
    return "tiles";
  }
}

function Mark({ cat, channelLogo }: { cat: Cat; channelLogo?: string }) {
  const league = leagueLogoFor(cat.label);
  const initials = cat.label.replace(/[^A-Za-z0-9+]/g, "").slice(0, 3);
  const blank = <span className="mark__blank">{initials}</span>;
  if (league) {
    return (
      <span className="mark mark--league">
        <SafeImg src={league} fallback={blank} />
      </span>
    );
  }
  return (
    <span className="mark">
      <SafeImg src={channelLogo} loading="lazy" fallback={blank} />
    </span>
  );
}

/** The categories inside one group: pinned favourites, A-Z sections, filters and a letter jump strip. */
export default function SubCategoryGrid({ group, counts, logos, total, pinned, onTogglePin, onPick, onShowAll }: SubCategoryGridProps) {
  const [needle, setNeedle] = useState("");
  const [sort, setSort] = useState<Sort>("az");
  const [view, setView] = useState<View>(readView);
  const [type, setType] = useState<CategoryType | "All">("All");

  useEffect(() => {
    try {
      localStorage.setItem("umh.catView", view);
    } catch {
      // storage unavailable: the choice just will not persist
    }
  }, [view]);

  // Type chips only help when the group really has several kinds (Sports does; most others do not).
  const typeCounts = useMemo(() => {
    const m = new Map<CategoryType, number>();
    for (const c of group.categories) m.set(categoryType(c.label), (m.get(categoryType(c.label)) ?? 0) + 1);
    return m;
  }, [group]);
  const showTypes = TYPES.filter((t) => (typeCounts.get(t) ?? 0) >= 2).length >= 3;

  const list = useMemo(() => {
    const q = needle.trim().toLowerCase();
    const out = group.categories.filter(
      (c) => (type === "All" || categoryType(c.label) === type) && (!q || c.label.toLowerCase().includes(q)),
    );
    return sort === "count"
      ? out.sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) || compareAlpha(a.label, b.label))
      : out.sort((a, b) => compareAlpha(a.label, b.label));
  }, [group, counts, needle, sort, type]);

  const pinnedCats = useMemo(
    () => group.categories.filter((c) => pinned.includes(c.name)).sort((a, b) => compareAlpha(a.label, b.label)),
    [group, pinned],
  );

  const sections = useMemo(() => {
    if (sort !== "az") return [{ key: "Most channels", items: list }];
    const by = new Map<string, Cat[]>();
    for (const c of list) {
      const k = letterOf(c.label);
      by.set(k, [...(by.get(k) ?? []), c]);
    }
    return [...by.entries()].sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b))).map(([key, items]) => ({ key, items }));
  }, [list, sort]);

  const letters = useMemo(() => new Set(sections.map((s) => s.key)), [sections]);
  const showJump = sort === "az" && group.categories.length >= JUMP_MIN && list.length > 0;

  const card = (c: Cat, big = false) => {
    const isPinned = pinned.includes(c.name);
    return (
      <div key={c.name} className={`scard ${big ? "scard--big" : ""}`}>
        <button type="button" className="scard__main" onClick={() => onPick(c.name)}>
          <Mark cat={c} channelLogo={logos.get(c.name)?.[0]} />
          <span className="scard__text">
            <span className="scard__name">{c.label}</span>
            <span className="scard__count nums">{(counts.get(c.name) ?? 0).toLocaleString()} channels</span>
          </span>
        </button>
        <button
          type="button"
          className={`scard__star ${isPinned ? "is-on" : ""}`}
          aria-pressed={isPinned}
          aria-label={`${isPinned ? "Unpin" : "Pin"} ${c.label}`}
          onClick={() => onTogglePin(c.name)}
        >
          <Icon name="star" size={18} />
        </button>
      </div>
    );
  };

  return (
    <div className="subcats">
      {pinnedCats.length > 0 && !needle.trim() && type === "All" && (
        <section className="subcats__pins">
          <h3 className="subcats__eyebrow">Your categories</h3>
          <div className="subcats__pingrid">{pinnedCats.map((c) => card(c, true))}</div>
        </section>
      )}

      <div className="subcats__controls">
        <button type="button" className="btn btn--sm" onClick={onShowAll}>
          <Icon name="grid" size={18} />
          All {total.toLocaleString()} channels
        </button>
        <div className="cats__search subcats__search">
          <Icon name="search" size={20} />
          <input
            className="input"
            placeholder={`Find in ${group.group}`}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            aria-label={`Find a ${group.group} category`}
          />
        </div>
        <div className="seg" role="group" aria-label="Sort">
          <button type="button" aria-pressed={sort === "az"} onClick={() => setSort("az")}>
            A–Z
          </button>
          <button type="button" aria-pressed={sort === "count"} onClick={() => setSort("count")}>
            Most channels
          </button>
        </div>
        <div className="seg" role="group" aria-label="Density">
          <button type="button" aria-pressed={view === "tiles"} onClick={() => setView("tiles")}>
            Tiles
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
            List
          </button>
        </div>
      </div>

      {showTypes && (
        <div className="chips" role="group" aria-label="Type">
          {(["All", ...TYPES] as const).map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
              {t}
              <span className="chip__count nums">{t === "All" ? group.categories.length : (typeCounts.get(t) ?? 0)}</span>
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="status">No categories match.</div>
      ) : (
        <div className={`subcats__sections ${view === "list" ? "is-list" : ""}`}>
          {sections.map((s) => (
            <section key={s.key} id={`cat-${s.key}`} className="subcats__letter">
              <h3 className="subcats__eyebrow subcats__heading">{s.key}</h3>
              <div className="subcats__cards">{s.items.map((c) => card(c))}</div>
            </section>
          ))}
        </div>
      )}

      {showJump && (
        <nav className="jump" aria-label="Jump to letter">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((k) => (
            <button
              key={k}
              type="button"
              disabled={!letters.has(k)}
              onClick={() => document.getElementById(`cat-${k}`)?.scrollIntoView({ block: "start" })}
              aria-label={`Jump to ${k}`}
            >
              {k}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
