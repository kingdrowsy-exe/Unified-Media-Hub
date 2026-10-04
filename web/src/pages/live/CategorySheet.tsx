import { useEffect, useMemo, useState } from "react";
import { CategoryGroup } from "../../utils/categoryGroups.js";
import Icon from "../../ui/Icon.js";

export type LiveFilter = { kind: "all" } | { kind: "group"; group: string } | { kind: "category"; category: string };

interface CategorySheetProps {
  groups: CategoryGroup[];
  groupCounts: Map<string, number>;
  categoryCounts: Map<string, number>;
  total: number;
  onPick: (filter: LiveFilter) => void;
  onClose: () => void;
}

/** Every category, grouped by the provider's own naming, with a quick filter. */
export default function CategorySheet({ groups, groupCounts, categoryCounts, total, onPick, onClose }: CategorySheetProps) {
  const [needle, setNeedle] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.group.toLowerCase().includes(q) || g.categories.some((c) => c.name.toLowerCase().includes(q)));
  }, [groups, needle]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="All categories">
        <header className="sheet__head">
          <div>
            <h2 className="h2">All categories</h2>
            <p className="muted">{total.toLocaleString()} channels</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="sheet__search">
          <input
            className="input"
            placeholder="Find a category"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            autoFocus
          />
        </div>
        <div className="sheet__body">
          <button type="button" className="sheet__row" onClick={() => onPick({ kind: "all" })}>
            <span>All channels</span>
            <span className="muted nums">{total.toLocaleString()}</span>
          </button>
          {shown.map((g) => {
            const single = g.categories.length === 1;
            const expanded = open === g.group || (needle.trim().length > 0 && !single);
            return (
              <div key={g.group} className="sheet__group">
                <div className="sheet__row-wrap">
                  <button
                    type="button"
                    className="sheet__row"
                    onClick={() => onPick(single ? { kind: "category", category: g.categories[0].name } : { kind: "group", group: g.group })}
                  >
                    <span>{single ? g.categories[0].name : g.group}</span>
                    <span className="muted nums">{(groupCounts.get(g.group) ?? 0).toLocaleString()}</span>
                  </button>
                  {!single && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} ${g.group} categories`}
                      onClick={() => setOpen(expanded ? null : g.group)}
                    >
                      <Icon name={expanded ? "down" : "next"} size={20} />
                    </button>
                  )}
                </div>
                {!single && expanded && (
                  <div className="sheet__subs">
                    {g.categories.map((c) => (
                      <button key={c.name} type="button" className="chip" onClick={() => onPick({ kind: "category", category: c.name })}>
                        {c.label}
                        <span className="chip__count nums">{categoryCounts.get(c.name) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
