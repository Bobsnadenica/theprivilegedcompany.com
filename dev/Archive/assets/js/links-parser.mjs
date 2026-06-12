const DEFAULT_CATEGORY_NAME = "Unsorted";
const COMMENT_PREFIXES = ["#", "//", "--"];

function isHttpUrl(value) {
  try {
    const candidate = new URL(value);
    return candidate.protocol === "http:" || candidate.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeLine(rawLine) {
  return rawLine.trim().replace(/^([-*]|\d+\.)\s+/, "");
}

function isCommentLine(line) {
  return COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function isCategoryLine(line) {
  return line.endsWith(":") && !isHttpUrl(line);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildTitleFromUrl(urlString) {
  const url = new URL(urlString);
  const host = url.hostname.replace(/^www\./, "");
  const hostSegments = host.split(".").filter(Boolean);
  const preferredHost =
    hostSegments.length > 1 ? hostSegments.slice(0, -1).join(" ") : host;

  return titleCase(preferredHost.replace(/[._-]+/g, " "));
}

function buildNoteFromUrl(urlString) {
  const url = new URL(urlString);
  const host = url.hostname.replace(/^www\./, "");
  const path = decodeURIComponent(url.pathname).replace(/\/$/, "");
  return path && path !== "" ? `${host}${path}` : host;
}

function parseStructuredLink(line, lineNumber) {
  const segments = line
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 1 && isHttpUrl(segments[0])) {
    return {
      title: buildTitleFromUrl(segments[0]),
      url: segments[0],
      note: buildNoteFromUrl(segments[0]),
    };
  }

  const urlIndexes = segments.reduce((indexes, segment, index) => {
    if (isHttpUrl(segment)) {
      indexes.push(index);
    }

    return indexes;
  }, []);

  if (urlIndexes.length !== 1) {
    throw new Error(
      `Line ${lineNumber} is not a valid link entry. Use a raw URL or a "Label | URL | Optional note" pattern.`,
    );
  }

  const url = segments[urlIndexes[0]];
  const textSegments = segments.filter((_, index) => index !== urlIndexes[0]);
  const title = textSegments[0] || buildTitleFromUrl(url);
  const note = textSegments.slice(1).join(" | ") || buildNoteFromUrl(url);

  return {
    title,
    url,
    note,
  };
}

function createCategory(name) {
  return {
    id: slugify(name) || slugify(DEFAULT_CATEGORY_NAME),
    name,
    links: [],
  };
}

export function parseLinksDocument(sourceText) {
  const categories = [];
  const seenCategoryIds = new Set();
  let currentCategory = null;

  sourceText.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = sanitizeLine(rawLine);

    if (!line || isCommentLine(line)) {
      return;
    }

    if (isCategoryLine(line)) {
      const name = line.slice(0, -1).trim();
      const category = createCategory(name || DEFAULT_CATEGORY_NAME);

      if (seenCategoryIds.has(category.id)) {
        throw new Error(
          `Line ${lineNumber} repeats the category "${name}". Keep each category heading unique.`,
        );
      }

      categories.push(category);
      currentCategory = category;
      seenCategoryIds.add(category.id);
      return;
    }

    if (!currentCategory) {
      currentCategory = createCategory(DEFAULT_CATEGORY_NAME);
      categories.push(currentCategory);
      seenCategoryIds.add(currentCategory.id);
    }

    const parsedLink = parseStructuredLink(line, lineNumber);
    const url = new URL(parsedLink.url);
    const host = url.hostname.replace(/^www\./, "");

    currentCategory.links.push({
      id: `${currentCategory.id}-${currentCategory.links.length + 1}`,
      title: parsedLink.title,
      url: url.href,
      note: parsedLink.note,
      host,
      searchText: [
        currentCategory.name,
        parsedLink.title,
        parsedLink.url,
        parsedLink.note,
        host,
      ]
        .join(" ")
        .toLowerCase(),
    });
  });

  const populatedCategories = categories.filter((category) => category.links.length > 0);
  const totalLinks = populatedCategories.reduce(
    (count, category) => count + category.links.length,
    0,
  );

  return {
    categories: populatedCategories,
    summary: {
      totalCategories: populatedCategories.length,
      totalLinks,
    },
  };
}
