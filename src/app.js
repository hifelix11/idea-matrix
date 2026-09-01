/* entry point — wires the modules together */

import { setRenderer, render } from "./view.js";
import { state, initStore } from "./store.js";
import { renderTabs } from "./tabs.js";
import { renderMatrix, isDragging } from "./matrix.js";
import { renderIdeas } from "./ideas.js";

setRenderer(()=>{
  renderTabs();
  renderMatrix();
  renderIdeas();
});

document.getElementById("exportBtn").onclick = ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "idea-matrix-" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
};

initStore({ isBusy: isDragging });
render();
