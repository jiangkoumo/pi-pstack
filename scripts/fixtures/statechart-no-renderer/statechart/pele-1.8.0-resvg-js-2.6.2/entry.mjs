// Default npm test has no PNG dependency. The statechart suite detects this failing import and
// skips its renderer cases; `npm run check:statechart:png` exercises the real renderer.
throw new Error("PNG renderer disabled in the default test plan");
