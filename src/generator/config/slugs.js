function makeCategorySlugBase(name) {
  const raw = typeof name === 'string' ? name : String(name ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return 'category';

  const normalized = trimmed
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'category';
}

function makeUniqueSlug(base, usedSlugs) {
  const current = usedSlugs.get(base) || 0;
  const next = current + 1;
  usedSlugs.set(base, next);
  return next === 1 ? base : `${base}-${next}`;
}

function assignCategorySlugs(categories, usedSlugs) {
  if (!Array.isArray(categories)) return;

  categories.forEach((category) => {
    if (!category || typeof category !== 'object') return;

    const base = makeCategorySlugBase(category.name);
    const uniqueSlug = makeUniqueSlug(base, usedSlugs);
    category.slug = uniqueSlug;

    if (Array.isArray(category.subcategories)) {
      assignCategorySlugs(category.subcategories, usedSlugs);
    }
  });
}

module.exports = {
  makeCategorySlugBase,
  makeUniqueSlug,
  assignCategorySlugs,
};
