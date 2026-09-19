export interface CategoryGroup {
  group: string;
  categories: { name: string; label: string }[];
}

// Xtream category names are conventionally either "GROUP | Label" (e.g. "US | Sports",
// "PPV Events | 1") or a shared leading word with no separator (e.g. "OnePlay Something",
// "24/7 Something"). Discover the grouping from whichever pattern the name actually uses,
// rather than hardcoding known prefixes - this generalizes to any provider's naming scheme.
function splitCategory(name: string): { group: string; label: string } {
  const pipeIndex = name.indexOf(" | ");
  if (pipeIndex !== -1) {
    return { group: name.slice(0, pipeIndex).trim(), label: name.slice(pipeIndex + 3).trim() };
  }
  const firstSpace = name.indexOf(" ");
  if (firstSpace === -1) {
    return { group: name, label: name };
  }
  return { group: name.slice(0, firstSpace).trim(), label: name };
}

// Groups that should stand on their own even when they'd otherwise be a singleton
// swept into "Other" - matched case-insensitively against the group name.
const STANDALONE_EXCEPTIONS = ["4K"];

export function groupCategories(categories: string[]): CategoryGroup[] {
  const byGroup = new Map<string, { name: string; label: string }[]>();
  for (const name of categories) {
    const { group, label } = splitCategory(name);
    const list = byGroup.get(group) ?? [];
    list.push({ name, label });
    byGroup.set(group, list);
  }

  const groups = [...byGroup.entries()].map(([group, cats]) => ({ group, categories: cats }));

  // Anything that ended up alone (no real family of categories to group with) gets
  // swept into a single "Other" folder instead of cluttering the sidebar with lots of
  // one-off standalone entries - except for explicit exceptions like "4K".
  const kept: CategoryGroup[] = [];
  const otherItems: { name: string; label: string }[] = [];
  for (const g of groups) {
    const isException = STANDALONE_EXCEPTIONS.some((ex) => g.group.toUpperCase().includes(ex));
    if (g.categories.length === 1 && !isException) {
      otherItems.push(...g.categories.map((c) => ({ name: c.name, label: c.name })));
    } else {
      kept.push(g);
    }
  }
  if (otherItems.length > 0) {
    kept.push({ group: "Other", categories: otherItems });
  }

  // Pinned exceptions (like "4K") surface right after "All" at the top of the sidebar
  // instead of wherever they happened to fall in the provider's original category order.
  const pinned: CategoryGroup[] = [];
  const rest: CategoryGroup[] = [];
  for (const g of kept) {
    const isException = STANDALONE_EXCEPTIONS.some((ex) => g.group.toUpperCase().includes(ex));
    (isException ? pinned : rest).push(g);
  }
  return [...pinned, ...rest];
}
