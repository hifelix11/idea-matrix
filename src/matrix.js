/* the 2x2 matrix: axes, dots, dragging */

import { esc, abbrev, initials } from "./helpers.js";
import { state, person, visiblePeople, getPl, ideaColor, touched } from "./store.js";
import { view, render } from "./view.js";
import { runAiRating, aiStatus } from "./ai.js";

const AXES = {
  x: {
    word: "Hype",
    info: "Hype — how exciting is this idea?\n\nHow much fun would it be to build, and how much does it genuinely interest you? Further right = more hype."
  },
  y: {
    word: "Payoff",
    info: "Payoff — how much could this idea realistically return?\n\nThink feasibility, effort, market size and money-making potential. Higher up = more payoff."
  }
};

let dragging = false; // a dot is mid-drag
export const isDragging = () => dragging;

const EYE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

const ideaLabel = idea => esc(idea.name) + (idea.desc ? " — " + esc(idea.desc) : "");

export function renderMatrix(){
  const m = document.getElementById("matrix");
  m.querySelectorAll(".dot").forEach(d=>d.remove());

  const title = document.getElementById("matrixTitle");
  const hint = document.getElementById("matrixHint");
  const toggle = document.getElementById("viewToggle");
  const eye = document.getElementById("eyeToggle");
  const rerate = document.getElementById("rerateBtn");
  const note = document.getElementById("aiNote");

  rerate.style.display = "none";
  note.style.display = "none";
  if(view.currentTab==="everyone"){
    title.textContent = "Everyone's matrix";
    toggle.style.display = "inline-flex";
    toggle.querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.mode===view.mergedMode));
    eye.style.display = "none";
    hint.textContent = "";
    renderMergedDots(m);
  }else{
    const p = person(view.currentTab);
    title.textContent = p.name + "'s matrix";
    toggle.style.display = "none";
    eye.style.display = "inline-flex";
    eye.innerHTML = p.hidden ? EYE_OFF_SVG : EYE_SVG;
    eye.classList.toggle("off", !!p.hidden);
    eye.title = p.hidden
      ? "Hidden from Everyone's matrix — click to include"
      : "Included in Everyone's matrix — click to hide";
    eye.onclick = ()=>{ p.hidden = !p.hidden; touched(); render(); };
    if(p.isAI){
      hint.textContent = "";
      rerate.style.display = "inline-flex";
      rerate.textContent = aiStatus() || "↻ Re-rate AI";
      rerate.disabled = !!aiStatus();
      rerate.onclick = runAiRating;
      if(p.aiNote){
        note.textContent = p.aiNote;
        note.style.display = "block";
      }
    }else{
      hint.textContent = "drag dots to move";
    }
    renderPersonDots(m, p);
  }

  renderAxis("axisX", AXES.x);
  renderAxis("axisY", AXES.y);
}

/* show only the axis word; the full description opens on click */
function renderAxis(id, axis){
  const el = document.getElementById(id);
  el.innerHTML = `${esc(axis.word)}<span class="axis-info">i</span>`;
  el.onclick = ()=> alert(axis.info);
}

function posToStyle(dot, pos){
  dot.style.left = (pos.x*100) + "%";
  dot.style.top  = ((1-pos.y)*100) + "%";
}

function makeDot(m, {className="", ideaId, text, label, badge, pos}){
  const d = document.createElement("div");
  d.className = "dot" + (className ? " " + className : "");
  d.style.background = ideaColor(ideaId);
  d.textContent = text;
  if(badge) d.innerHTML += `<span class="badge">${badge}</span>`;
  d.innerHTML += `<span class="dot-label">${label}</span>`;
  posToStyle(d, pos);
  m.appendChild(d);
  return d;
}

function renderPersonDots(m, p){
  const pl = getPl(p.id);
  state.ideas.forEach(idea=>{
    const pos = pl[idea.id];
    if(!pos) return;
    const d = makeDot(m, {
      className: p.isAI ? "locked" : "",
      ideaId:idea.id, text:abbrev(idea.name), label:ideaLabel(idea), pos
    });
    if(!p.isAI) enableDrag(d, m, p.id, idea.id); // the AI's dots stay where the AI put them
  });
}

function renderMergedDots(m){
  const people = visiblePeople();
  if(view.mergedMode==="avg"){
    state.ideas.forEach(idea=>{
      let sx=0, sy=0, n=0;
      people.forEach(p=>{
        const pos = (state.placements[p.id]||{})[idea.id];
        if(pos){ sx+=pos.x; sy+=pos.y; n++; }
      });
      if(!n) return;
      makeDot(m, {
        className:"avg", ideaId:idea.id, text:abbrev(idea.name),
        label:ideaLabel(idea), badge:`${n}/${people.length}`,
        pos:{x:sx/n, y:sy/n}
      });
    });
  }else{
    people.forEach(p=>{
      const pl = state.placements[p.id]||{};
      state.ideas.forEach(idea=>{
        const pos = pl[idea.id];
        if(!pos) return;
        makeDot(m, {
          className:"small", ideaId:idea.id, text:initials(p.name),
          label:`${esc(idea.name)} — ${esc(p.name)}`, pos
        });
      });
    });
  }
}

function enableDrag(dot, m, pid, iid){
  dot.addEventListener("pointerdown", e=>{
    e.preventDefault(); e.stopPropagation();
    dot.setPointerCapture(e.pointerId);
    dragging = true;
    const r = m.getBoundingClientRect();
    let outside = false;

    const move = ev=>{
      const rx = (ev.clientX - r.left)/r.width;
      const ry = (ev.clientY - r.top)/r.height;
      outside = rx < -0.08 || rx > 1.08 || ry < -0.08 || ry > 1.08;
      dot.style.opacity = outside ? .3 : 1;
      const x = Math.min(1, Math.max(0, rx));
      const y = Math.min(1, Math.max(0, 1-ry));
      posToStyle(dot, {x, y});
      dot._pos = {x, y};
    };
    const up = ()=>{
      dragging = false;
      dot.removeEventListener("pointermove", move);
      dot.removeEventListener("pointerup", up);
      if(outside){ delete getPl(pid)[iid]; }
      else if(dot._pos){ getPl(pid)[iid] = dot._pos; }
      touched(); render();
    };
    dot.addEventListener("pointermove", move);
    dot.addEventListener("pointerup", up);
  });
}

/* Average / Everyone's dots toggle */
document.getElementById("viewToggle").addEventListener("click", e=>{
  const b = e.target.closest("button"); if(!b) return;
  view.mergedMode = b.dataset.mode; render();
});
