import "@testing-library/jest-dom";

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
