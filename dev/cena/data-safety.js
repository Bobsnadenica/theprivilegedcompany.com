/* Small shared guards for saved browser data and imported price snapshots. */
(function (root) {
  const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !['__proto__', 'prototype', 'constructor'].includes(value);
  function normalizeLists(data) {
    if (!data || !Array.isArray(data.lists)) return null;
    const ids = new Set();
    const lists = data.lists.slice(0, 50).filter(list => list && safeId(list.id) && !ids.has(list.id) && ids.add(list.id)).map(list => {
      const items = Array.isArray(list.items) ? [...new Set(list.items.filter(safeId))].slice(0, 1000) : [];
      const quantities = {};
      for (const id of items) {
        const value = list.quantities?.[id];
        if (Number.isFinite(value) && value > 0) quantities[id] = Math.min(999, Math.round(value));
      }
      return { id: list.id, name: typeof list.name === 'string' && list.name.trim() ? list.name.slice(0, 80) : 'Shopping list', items, quantities, created: typeof list.created === 'string' ? list.created : new Date().toISOString().slice(0, 10) };
    });
    if (!lists.length) return null;
    return { activeId: lists.some(list => list.id === data.activeId) ? data.activeId : lists[0].id, lists };
  }
  function normalizeCards(value, storeIds) {
    if (!Array.isArray(value)) return [];
    return value.filter(card => card && storeIds.includes(card.storeId) && typeof card.number === 'string' && card.number.length > 0 && card.number.length <= 80).slice(0, 50).map(card => ({ storeId: card.storeId, label: typeof card.label === 'string' ? card.label.slice(0, 80) : '', number: card.number, updatedAt: Number.isFinite(card.updatedAt) ? card.updatedAt : 0 }));
  }
  const validPrice = value => Number.isFinite(value) && value > 0;
  const api = { normalizeLists, normalizeCards, validPrice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpestiSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
