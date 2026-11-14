/* Product registry: one entry per dashboard. The server-side mapping to Payhip products lives in
   supabase/functions/_shared/products.ts. To add a dashboard (Focus, Money, and so on):
   1. put its module in site/dashboards/<slug>/ (it registers window.ToolkitDashboards["<slug>"]),
   2. add its <script> tags to index.html,
   3. add an entry below and in products.ts, then rebuild and redeploy. */
window.TOOLKIT_PRODUCTS = [
  {
    slug: "discipline",
    name: "Discipline by Design",
    kicker: "DISCIPLINE",
    kickerItalic: "by Design",
    blurb: "Your one habit, your returns, and your weekly design sessions.",
    buyUrl: "https://payhip.com/b/sO8Km",
    route: "#/d/discipline/today",
    /* Where the earlier device-only version kept its data, for the one-time import offer. */
    legacyKey: "dbd.discipline.v1.mine"
  }
];
