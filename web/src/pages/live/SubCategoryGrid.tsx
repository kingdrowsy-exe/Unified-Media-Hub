import { useMemo, useState } from "react";
import { CategoryGroup } from "../../utils/categoryGroups.js";
import Icon from "../../ui/Icon.js";
import { compareAlpha } from "../../utils/alpha.js";
import SafeImg from "../../ui/SafeImg.js";

interface SubCategoryGridProps {
  group: CategoryGroup;
  counts: Map<string, number>;
  /** Up to three channel logos per full category name. */
  logos: Map<string, string[]>;
  total: number;
  onPick: (category: string) => void;
  onShowAll: () => void;
}

/** The categories inside one group, as tiles with a logo strip and a count. */
export default function SubCategoryGrid({ group, counts, logos, total, onPick, onShowAll }: SubCategoryGridProps) {
  const [needle, setNeedle] = useState("");

  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase();
    const list = [...group.categories].sort((a, b) => compareAlpha(a.label, b.label));
    return q ? list.filter((c) => c.label.toLowerCase().includes(q)) : list;
  }, [group, needle]);

  return (
    <div className="subcats">
      <div className="subcats__head">
        <button type="button" className="btn btn--sm" onClick={onShowAll}>
          <Icon name="grid" size={18} />
          All {total.toLocaleString()} channels
        </button>
        {group.categories.length > 12 && (
          <div className="cats__search">
            <Icon name="search" size={20} />
            <input
              className="input"
              placeholder={`Find in ${group.group}`}
              value={needle}
              onChange={(e) => setNeedle(e.target.value)}
              aria-label={`Find a ${group.group} category`}
            />
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="status">No categories match.</div>
      ) : (
        <div className="subcats__grid">
          {shown.map((c) => {
            const picks = logos.get(c.name) ?? [];
            return (
              <button key={c.name} type="button" className="subcat" onClick={() => onPick(c.name)}>
                <span className="subcat__strip" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="subcat__cell">
                      {picks[i] && <SafeImg src={picks[i]} loading="lazy" />}
                    </span>
                  ))}
                </span>
                <span className="subcat__name">{c.label}</span>
                <span className="subcat__meta nums">{(counts.get(c.name) ?? 0).toLocaleString()} channels</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
