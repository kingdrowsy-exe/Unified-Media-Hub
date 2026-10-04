import { useMemo, useState } from "react";
import { CategoryGroup } from "../../utils/categoryGroups.js";
import Icon from "../../ui/Icon.js";
import SafeImg from "../../ui/SafeImg.js";

export type LiveFilter = { kind: "all" } | { kind: "group"; group: string } | { kind: "category"; category: string };

interface CategoryGridProps {
  groups: CategoryGroup[];
  groupCounts: Map<string, number>;
  /** Up to four channel logos per group, used as a preview mosaic. */
  logos: Map<string, string[]>;
  total: number;
  onPick: (filter: LiveFilter) => void;
}

/** Every category group as a tile: name, channel count, a logo mosaic and how many sub-categories it holds. */
export default function CategoryGrid({ groups, groupCounts, logos, total, onPick }: CategoryGridProps) {
  const [needle, setNeedle] = useState("");

  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase();
    const list = [...groups].sort((a, b) => (groupCounts.get(b.group) ?? 0) - (groupCounts.get(a.group) ?? 0));
    if (!q) return list;
    return list.filter((g) => g.group.toLowerCase().includes(q) || g.categories.some((c) => c.name.toLowerCase().includes(q)));
  }, [groups, groupCounts, needle]);

  return (
    <div className="cats">
      <div className="cats__head">
        <p className="muted nums">
          {groups.length} groups · {total.toLocaleString()} channels
        </p>
        <div className="cats__search">
          <Icon name="search" size={20} />
          <input
            className="input"
            placeholder="Find a category"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            aria-label="Find a category"
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="status">No categories match.</div>
      ) : (
        <div className="cats__grid">
          {shown.map((g) => {
            const single = g.categories.length === 1;
            const picks = logos.get(g.group) ?? [];
            return (
              <button
                key={g.group}
                type="button"
                className="cat"
                onClick={() => onPick(single ? { kind: "category", category: g.categories[0].name } : { kind: "group", group: g.group })}
              >
                <span className="cat__mosaic" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="cat__cell">
                      {picks[i] && <SafeImg src={picks[i]} loading="lazy" />}
                    </span>
                  ))}
                </span>
                <span className="cat__name">{g.group}</span>
                <span className="cat__meta nums">
                  {(groupCounts.get(g.group) ?? 0).toLocaleString()} channels
                  {!single && ` · ${g.categories.length} categories`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
