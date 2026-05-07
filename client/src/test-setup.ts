import "@testing-library/jest-dom/vitest";

// Surface unhandled promise rejections during component tests so we don't
// accidentally pass a green test while a hook silently throws.
process.on("unhandledRejection", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled rejection in test:", err);
  throw err;
});
