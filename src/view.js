/* shared view state and the render entry point */

export const view = {
  currentTab: "everyone", // "everyone" or personId
  mergedMode: "avg"       // "avg" | "all"
};

let renderer = () => {};
export const setRenderer = fn => { renderer = fn; };
export const render = () => renderer();
