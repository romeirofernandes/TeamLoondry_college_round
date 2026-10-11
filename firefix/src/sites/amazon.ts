import type { Adapter } from "./types";
export const amazon: Adapter = {
  site: "amazon",
  scope: "#dp, #search, #sc-active-cart",
  current: "#productTitle",
  entities: {
    product:
      '[data-component-type="s-search-result"][data-asin] h2 a, [data-component-type="s-search-result"][data-asin] a:has(h2), [data-asin].sc-list-item a.sc-product-link',
  },
  actions: [
    {
      id: "A01",
      pattern: /^search(?: amazon)?(?: for)? (.+)$/,
      extract: "query",
      operation: { kind: "search", url: "https://www.amazon.in/s?k={query}" },
    },
    {
      id: "A02",
      pattern: /^(?:show|open)(?: the)? (.+?)(?: product)?$/,
      extract: "query",
      operation: { kind: "entities", entity: "product" },
    },
    {
      id: "A03",
      pattern:
        /^(?:only show items |filter |show items )?under (.+?)(?: rupees)?$/,
      extract: "number",
      operation: { kind: "price", upper: "#high-price", submit: "Go" },
    },
    {
      id: "A04",
      pattern: /^between (.+) and (.+?)(?: rupees)?$/,
      extract: "number",
      operation: {
        kind: "price",
        lower: "#low-price",
        upper: "#high-price",
        submit: "Go",
      },
    },
    {
      id: "A05",
      pattern: /^(?:filter by (.+)|show(?: the)? (.+) brand)$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: "#brandsRefinements",
        verify: "selected",
      },
    },
    {
      id: "A06",
      pattern: /^sort by (.+)$/,
      extract: "query",
      operation: { kind: "select", selector: "#s-result-sort-select" },
    },
    {
      id: "A07",
      pattern: /^(?:clear(?: the)? price filter|remove all filters)$/,
      operation: {
        kind: "control",
        names: ["Clear", "Clear all", "Clear all filters"],
        scope: "#s-refinements",
        verify: "entity-change",
      },
    },
    {
      id: "A08",
      pattern: /^(?:choose|select)(?: size)? (.+)$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: "#twister,#twister_feature_div",
        verify: "selected",
      },
    },
    {
      id: "A09",
      pattern: /^choose (.+) version$/,
      extract: "query",
      operation: {
        kind: "control",
        names: [],
        scope: "#twister,#twister_feature_div",
        verify: "selected",
      },
    },
    {
      id: "A10",
      pattern: /^what variant is selected$/,
      operation: { kind: "info" },
    },
    {
      id: "A11",
      pattern: /^(?:show product details|go to specifications)$/,
      operation: { kind: "section" },
    },
    {
      id: "A12",
      pattern: /^show customer reviews$/,
      operation: { kind: "section" },
    },
    {
      id: "A13",
      pattern: /^(?:show (.+) reviews|sort reviews by (.+))$/,
      extract: "query",
      operation: {
        kind: "select",
        selector: "#review-sort-order,#filterByStar",
      },
    },
    {
      id: "A14",
      pattern: /^show the next product image$/,
      operation: {
        kind: "control",
        names: ["Next image", "Next"],
        scope: "#imageBlock,#ivLargeImage",
        verify: "entity-change",
      },
    },
    {
      id: "A15",
      pattern: /^close image zoom$/,
      operation: {
        kind: "control",
        names: ["Close"],
        scope: '[role="dialog"],#ivImagesTab',
        verify: "closed",
      },
    },
    {
      id: "A16",
      pattern: /^go back to search results$/,
      operation: { kind: "back" },
    },
    {
      id: "A17",
      pattern: /^add (?:one|1) of these to my cart$/,
      write: true,
      operation: {
        kind: "unsupported",
        reason:
          "Cart additions need a live-qualified product, variant, seller, price and cart postcondition. Use the local cart demo for now.",
      },
    },
    {
      id: "A18",
      pattern: /^open my cart$/,
      operation: { kind: "route", path: "/gp/cart/view.html" },
    },
    {
      id: "A19",
      pattern: /^set this item.s quantity to (.+)$/,
      extract: "number",
      write: true,
      operation: {
        kind: "unsupported",
        reason: "Live cart changes are not qualified in this version.",
      },
    },
    {
      id: "A20",
      pattern: /^remove (.+) from my cart$/,
      extract: "query",
      write: true,
      operation: {
        kind: "unsupported",
        reason: "Live cart removal is not qualified in this version.",
      },
    },
    {
      id: "A24",
      pattern: /^show delivery information$/,
      operation: { kind: "section" },
    },
    {
      id: "A25",
      pattern: /^show other sellers$/,
      operation: {
        kind: "control",
        names: ["Other sellers on Amazon", "See all buying options"],
        verify: "expanded",
      },
    },
  ],
};
