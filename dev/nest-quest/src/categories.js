export const CATEGORIES = {
  housing: { essential: true, color: '#b79977' },
  groceries: { essential: true, color: '#729573' },
  bills: { essential: true, color: '#b9ae77' },
  transport: { essential: true, color: '#7caaa6' },
  health: { essential: true, color: '#a98ab0' },
  dining: { essential: false, color: '#df9d66' },
  shopping: { essential: false, color: '#c08076' },
  fun: { essential: false, color: '#c5a658' },
  subscriptions: { essential: false, color: '#8292b5' },
  gifts: { essential: false, color: '#ca8ca5' },
  other: { essential: false, color: '#98a18b' },
};
export const CATEGORY_ICONS = Object.keys(CATEGORIES);
export const normalizeCategoryName = name => typeof name === 'string' ? name.trim().normalize('NFKC').toLowerCase() : '';

export function isValidCustomCategory(category) {
  return !!category && typeof category === 'object' && !Array.isArray(category)
    && typeof category.id === 'string' && /^custom-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(category.id)
    && typeof category.name === 'string' && !!category.name.trim() && category.name.length <= 32
    && CATEGORY_ICONS.includes(category.icon)
    && typeof category.color === 'string' && /^#[a-f0-9]{6}$/i.test(category.color);
}

export function categoryOptions(state) {
  return [
    ...Object.entries(CATEGORIES).map(([id, category]) => ({ id, name: null, icon: id, ...category, custom: false })),
    ...(state.customCategories || []).map(category => ({ id: category.id, name: category.name,
      icon: category.icon, color: category.color, essential: false, custom: true })),
  ];
}

export function categoryById(state, id) {
  if (Object.hasOwn(CATEGORIES, id)) return { id, name: null, icon: id, ...CATEGORIES[id], custom: false };
  const category = state.customCategories?.find(item => item.id === id);
  return category ? { id: category.id, name: category.name, icon: category.icon,
    color: category.color, essential: false, custom: true } : null;
}
