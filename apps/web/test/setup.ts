// jsdom ships no matchMedia, and theme.ts reads it once at module scope. Any test that pulls in
// a page renders that import chain, so the stub belongs here rather than in each test file.
if (typeof globalThis.matchMedia !== 'function') {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof globalThis.matchMedia;
}
