import "@testing-library/jest-dom";

// cmdk (the command palette) calls scrollIntoView on the active item and uses
// ResizeObserver; jsdom implements neither. Stub both so the palette renders.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom (25) ships Blob/File without `.text()`, which the app uses to read a
// picked hand-in file. The real Tauri webview has it; polyfill it for tests via
// the FileReader jsdom does implement.
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function () {
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsText(this as unknown as Blob);
    });
  };
}
