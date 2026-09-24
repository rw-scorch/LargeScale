export const TOURISM = {
  park: { value: 0.2 }, plaza: { value: 0.2 }, campground: { value: 0.4, season: { summer: 1.6, winter: 0.2 } },
  museum: { value: 1.5 }, zoo: { value: 2 }, theme_park: { value: 6, season: { summer: 1.4, winter: 0.5 } },
  golf_course: { value: 2, season: { winter: 0.4 } }, marina: { value: 2.5, season: { summer: 1.5, winter: 0.3 } },
  arena: { value: 3 }, stadium: { value: 6 }, casino: { value: 4 }, luxury_hotel: { value: 3 },
  beach_resort: { value: 5, season: { summer: 1.6, spring: 1.0, autumn: 0.8, winter: 0.3 } },
  ski_resort: { value: 5, season: { winter: 1.8, spring: 0.6, autumn: 0.5, summer: 0.2 } },
  wonder_pyramid: { value: 8, wonder: true }, wonder_colossus: { value: 9, wonder: true }, wonder_clocktower: { value: 10, wonder: true },
  wonder_grand_tower: { value: 11, wonder: true }, wonder_orbital_elevator: { value: 14, wonder: true },
};

export function tourismIncome(types, season, { airport = false, port = false, rail = false } = {}) {
  let sum = 0, wonders = 0;
  const kinds = new Set();
  for (const t of types) {
    const d = TOURISM[t];
    if (!d) continue;
    kinds.add(t);
    if (d.wonder) wonders++;
    sum += d.value * (d.season?.[season] ?? 1);
  }
  const variety = Math.sqrt(Math.max(1, kinds.size)) / Math.sqrt(Math.max(1, types.length || 1)) * 0.5 + 0.5;
  const reach = 1 + (airport ? 0.25 : 0) + (port ? 0.1 : 0) + (rail ? 0.1 : 0);
  return sum * (1 + 0.1 * wonders) * reach * variety;
}
