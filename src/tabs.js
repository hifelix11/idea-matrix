/* the Everyone / person tabs */

import { uid, esc, arrows } from "./helpers.js";
import { state, touched } from "./store.js";
import { view, render } from "./view.js";
import { runAiRating, aiStatus } from "./ai.js";

export function renderTabs(){
  const el = document.getElementById("tabs");
  el.innerHTML = "";

  const all = document.createElement("button");
  all.className = "tab everyone" + (view.currentTab==="everyone" ? " active" : "");
  all.textContent = "Everyone";
  all.onclick = ()=>{ view.currentTab = "everyone"; render(); };
  el.appendChild(all);

  state.people.forEach(p=>{
    const t = document.createElement("button");
    t.className = "tab" + (view.currentTab===p.id ? " active" : "");
    t.innerHTML = esc(p.name) + (state.people.length>1 ? '<span class="x" title="Remove person">×</span>' : "");
    t.onclick = e=>{
      if(e.target.classList.contains("x")){
        if(confirm(`Remove ${p.name} and their dots?`)){
          state.people = state.people.filter(x=>x.id!==p.id);
          delete state.placements[p.id];
          if(view.currentTab===p.id) view.currentTab = "everyone";
          touched(); render();
        }
        return;
      }
      view.currentTab = p.id; render();
    };
    t.ondblclick = e=>{
      if(e.target.classList.contains("x")) return;
      const n = prompt("Rename person:", p.name);
      if(n && n.trim()){ p.name = arrows(n.trim()); touched(); render(); }
    };
    el.appendChild(t);
  });

  const add = document.createElement("button");
  add.className = "tab add";
  add.textContent = "+ Add person";
  add.onclick = ()=>{
    const n = prompt("Who's joining?");
    if(n && n.trim()){
      const p = {id:uid(), name:arrows(n.trim())};
      state.people.push(p);
      view.currentTab = p.id;
      touched(); render();
    }
  };
  el.appendChild(add);

  const ai = document.createElement("button");
  ai.className = "tab add";
  ai.textContent = aiStatus() || (state.people.some(p=>p.isAI) ? "↻ Re-rate AI" : "+ Add AI");
  ai.disabled = !!aiStatus();
  ai.onclick = runAiRating;
  el.appendChild(ai);
}
