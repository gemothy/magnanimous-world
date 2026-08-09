import nextVitals from "eslint-config-next/core-web-vitals";

// This repository holds several independent applications side by side. `tiki-lounge`
// and `lounge-party` each have their own package.json, tsconfig and Vercel project, and
// `gone-away` is a standalone static build served straight from disk. None of them are
// part of the root Next app's compilation, and the root app imports nothing from any of
// them — so linting them from here only produces failures for code that is configured,
// built and deployed somewhere else.
//
// The same separation is mirrored in the root tsconfig's `exclude`. Leaving it out there
// broke the Vercel build: the root project's `@/*` alias points at the repository root,
// so tiki-lounge's `@/lib/library` resolved to `<root>/lib/library`, which does not
// exist. The module was never missing — it was being compiled by the wrong project.
const config = [
  {
    ignores: [
      ".next/**",
      "**/node_modules/**",
      "tiki-lounge/**",
      "lounge-party/**",
      "gone-away/**",
    ],
  },
  ...nextVitals,
];

export default config;
