/* the idea list and its add/edit form */

import { uid, esc, arrows } from "./helpers.js";
import { state, visiblePeople, getPl, ideaColor, touched } from "./store.js";
import { view, render } from "./view.js";
import { showFeasibility } from "./feasibility.js";

let editingIdeaId = null; // idea loaded into the add form for editing

export function renderIdeas(){
  const list = document.getElementById("ideaList");
  const sub  = document.getElementById("ideasSub");
  list.innerHTML = "";

  if(editingIdeaId && !state.ideas.some(i=>i.id===editingIdeaId)) editingIdeaId = null;
  document.getElementById("ideaAddBtn").textContent = editingIdeaId ? "Save" : "Add";

  sub.textContent = view.currentTab==="everyone"
    ? "Pick a person's tab to place dots."
    : "Tap + to drop a dot in the middle, then drag it.";

  if(!state.ideas.length){
    list.innerHTML = '<div class="empty">No ideas yet — add your first one below.</div>';
    return;
  }

  /* order: not on this matrix -> placed, not fully rated -> fully rated, then A-Z */
  const pl = view.currentTab==="everyone" ? null : getPl(view.currentTab);
  const people = visiblePeople();
  const rated = idea => people.filter(p=>(state.placements[p.id]||{})[idea.id]).length;
  const fullyRated = idea => people.length>0 && rated(idea)===people.length ? 1 : 0;
  const sorted = state.ideas.slice().sort((a,b)=>{
    if(pl && !!pl[a.id] !== !!pl[b.id]) return pl[a.id] ? 1 : -1;
    if(fullyRated(a) !== fullyRated(b)) return fullyRated(a) - fullyRated(b);
    return a.name.localeCompare(b.name);
  });

  sorted.forEach(idea=> list.appendChild(ideaRow(idea, rated(idea))));
}

function ideaRow(idea, ratedCount){
  const row = document.createElement("div");
  row.className = "idea-row";

  const actionHtml = view.currentTab==="everyone"
    ? `<span class="stat">${ratedCount}/${visiblePeople().length} rated</span>`
    : (pl => `<button class="idea-act ${pl?'placed':''}" title="${pl?'Remove from matrix':'Place in the middle of the matrix'}">${pl?'✓':'+'}</button>`)(!!getPl(view.currentTab)[idea.id]);

  row.innerHTML = `
    <div class="idea-top">
      <span class="swatch" style="background:${ideaColor(idea.id)}"></span>
      <button class="idea-feas ${idea.feasibility?'done':''}" title="${idea.feasibility?'Show feasibility check':'Run AI feasibility check'}">📈</button>
      <button class="idea-edit" title="Edit idea">✎</button>
      <button class="idea-del" title="Delete idea">✕</button>
      ${actionHtml}
    </div>
    <span class="name" title="Double-click to edit">${esc(idea.name)}${idea.desc ? `<span class="desc">${esc(idea.desc)}</span>` : ""}</span>`;

  const act = row.querySelector(".idea-act");
  if(act){
    act.onclick = ()=>{
      const pl = getPl(view.currentTab);
      if(pl[idea.id]) delete pl[idea.id];
      else pl[idea.id] = {x:0.5, y:0.5};
      touched(); render();
    };
  }
  row.querySelector(".name").ondblclick = ()=> startEdit(idea);
  row.querySelector(".idea-edit").onclick = ()=> startEdit(idea);
  row.querySelector(".idea-feas").onclick = ()=> showFeasibility(idea);
  row.querySelector(".idea-del").onclick = ()=>{
    if(!confirm(`Delete "${idea.name}" for everyone?`)) return;
    state.ideas = state.ideas.filter(i=>i.id!==idea.id);
    Object.values(state.placements).forEach(pl=>delete pl[idea.id]);
    if(editingIdeaId===idea.id) editingIdeaId = null;
    touched(); render();
  };
  return row;
}

/* ---------------- add / edit form ---------------- */
const nameInput = () => document.getElementById("ideaInput");
const descInput = () => document.getElementById("ideaDescInput");

function startEdit(idea){
  editingIdeaId = idea.id;
  nameInput().value = idea.name;
  descInput().value = idea.desc || "";
  render();
  nameInput().focus();
}

function cancelEdit(){
  if(!editingIdeaId) return;
  editingIdeaId = null;
  nameInput().value = "";
  descInput().value = "";
  render();
}

function addIdea(){
  const v = nameInput().value.trim();
  if(!v) return;
  const editing = editingIdeaId && state.ideas.find(i=>i.id===editingIdeaId);
  if(editing){
    editing.name = arrows(v);
    editing.desc = arrows(descInput().value.trim());
  }else{
    state.ideas.push({id:uid(), name:arrows(v), desc:arrows(descInput().value.trim())});
  }
  editingIdeaId = null;
  nameInput().value = "";
  descInput().value = "";
  touched(); render();
  nameInput().focus();
}

document.getElementById("ideaAddBtn").onclick = addIdea;
nameInput().addEventListener("keydown", e=>{
  if(e.key==="Enter") addIdea();
  if(e.key==="Escape") cancelEdit();
});
// Enter saves, Shift+Enter makes a new line
descInput().addEventListener("keydown", e=>{
  if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); addIdea(); }
  if(e.key==="Escape") cancelEdit();
});
