import { parseLinksDocument } from "./links-parser.mjs";

const state = {
  archive: null,
  activeCategory: "all",
  searchTerm: "",
  syncStamp: "live source",
};

const elements = {
  heroLinkCount: document.querySelector("#hero-link-count"),
  heroCategoryCount: document.querySelector("#hero-category-count"),
  syncStamp: document.querySelector("#sync-stamp"),
  resultsSummary: document.querySelector("#results-summary"),
  searchInput: document.querySelector("#search-input"),
  categoryPills: document.querySelector("#category-pills"),
  categoryStack: document.querySelector("#category-stack"),
  emptyState: document.querySelector("#empty-state"),
  errorState: document.querySelector("#error-state"),
  errorMessage: document.querySelector("#error-message"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSyncStamp(lastModified) {
  if (!lastModified) {
    return "live source";
  }

  const parsedDate = new Date(lastModified);

  if (Number.isNaN(parsedDate.getTime())) {
    return "live source";
  }

  return `synced ${parsedDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}

function createArchiveModel(parsedArchive) {
  const categories = parsedArchive.categories.map((category, categoryIndex) => ({
    ...category,
    links: category.links.map((link, linkIndex) => ({
      ...link,
      categoryName: category.name,
      order: categoryIndex * 1000 + linkIndex,
    })),
  }));

  return {
    ...parsedArchive,
    categories,
  };
}

function getVisibleCategories() {
  if (!state.archive) {
    return [];
  }

  const normalizedQuery = state.searchTerm.trim().toLowerCase();

  return state.archive.categories
    .filter((category) => state.activeCategory === "all" || category.id === state.activeCategory)
    .map((category) => ({
      ...category,
      links: category.links.filter((link) => {
        if (!normalizedQuery) {
          return true;
        }

        return link.searchText.includes(normalizedQuery);
      }),
    }))
    .filter((category) => category.links.length > 0);
}

function renderHeader() {
  elements.heroLinkCount.textContent = String(state.archive.summary.totalLinks);
  elements.heroCategoryCount.textContent = String(state.archive.summary.totalCategories);
  elements.syncStamp.textContent = state.syncStamp;
}

function renderCategoryPills() {
  const buttons = [
    `<button class="category-pill${state.activeCategory === "all" ? " is-active" : ""}" type="button" data-category="all">[ all ]</button>`,
    ...state.archive.categories.map(
      (category) =>
        `<button class="category-pill${state.activeCategory === category.id ? " is-active" : ""}" type="button" data-category="${escapeHtml(category.id)}">[ ${escapeHtml(category.name)} ]</button>`,
    ),
  ];

  elements.categoryPills.innerHTML = buttons.join("");
}

function renderSummary(visibleCategories) {
  const visibleLinkCount = visibleCategories.reduce(
    (count, category) => count + category.links.length,
    0,
  );

  elements.resultsSummary.textContent = `${visibleLinkCount} visible links across ${visibleCategories.length} categories.`;
}

function renderArchive() {
  const visibleCategories = getVisibleCategories();
  renderSummary(visibleCategories);
  elements.emptyState.hidden = visibleCategories.length > 0;

  elements.categoryStack.innerHTML = visibleCategories
    .map(
      (category) => `
        <section class="category-block" id="category-${escapeHtml(category.id)}">
          <header class="category-block__header">
            <h2>:: ${escapeHtml(category.name)}</h2>
            <p>${category.links.length} link${category.links.length === 1 ? "" : "s"}</p>
          </header>
          <div class="link-list">
            ${category.links
              .map(
                (link) => `
                  <a class="ascii-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer noopener">
                    <span class="ascii-link__lead">&gt;</span>
                    <span class="ascii-link__content">
                      <span class="ascii-link__title">[ ${escapeHtml(link.title)} ]</span>
                      <span class="ascii-link__meta">// ${escapeHtml(link.host)}</span>
                      <span class="ascii-link__note">-- ${escapeHtml(link.note)}</span>
                    </span>
                  </a>
                `,
              )
              .join("")}
          </div>
        </section>
      `,
    )
    .join("");
}

function renderApp() {
  renderHeader();
  renderCategoryPills();
  renderArchive();
}

function clearSearch() {
  state.searchTerm = "";
  elements.searchInput.value = "";
  renderArchive();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    renderArchive();
  });

  elements.categoryPills.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-category]");

    if (!trigger) {
      return;
    }

    state.activeCategory = trigger.dataset.category || "all";
    renderCategoryPills();
    renderArchive();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTypingField =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);

    if (event.key === "/" && !isTypingField) {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
      return;
    }

    if (event.key === "Escape" && elements.searchInput.value) {
      clearSearch();
    }
  });
}

async function loadArchive() {
  try {
    const response = await fetch("./Links.txt", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Could not load Links.txt (${response.status}).`);
    }

    const documentText = await response.text();
    state.archive = createArchiveModel(parseLinksDocument(documentText));
    state.syncStamp = formatSyncStamp(response.headers.get("last-modified"));
    renderApp();
  } catch (error) {
    elements.errorState.hidden = false;
    elements.errorMessage.textContent =
      error instanceof Error ? error.message : "Unknown error.";
    elements.resultsSummary.textContent = "The archive could not be loaded.";
  }
}

bindEvents();
loadArchive();
