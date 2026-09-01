/* the 2x2 matrix: axes, dots, dragging */

import { esc, abbrev, initials } from "./helpers.js";
import { state, person, getPl, ideaColor, touched } from "./store.js";
import { view, render } from "./view.js";

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

const ideaLabel = idea => esc(idea.name) + (idea.desc ? " — " + esc(idea.desc) : "");

export function renderMatrix(){
  const m = document.getElementById("matrix");
  m.querySelectorAll(".dot").forEach(d=>d.remove());

  const title = document.getElementById("matrixTitle");
  const hint = document.getElementById("matrixHint");
  const toggle = document.getElementById("viewToggle");

  if(view.currentTab==="everyone"){
    title.textContent = "Everyone's matrix";
    toggle.style.display = "inline-flex";
    toggle.querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.mode===view.mergedMode));
    hint.textContent = "";
    renderMergedDots(m);
  }else{
    const p = person(view.currentTab);
    title.textContent = p.name + "'s matrix";
    toggle.style.display = "none";
    hint.textContent = "drag dots to move · drag out to remove";
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
    const d = makeDot(m, {ideaId:idea.id, text:abbrev(idea.name), label:ideaLabel(idea), pos});
    enableDrag(d, m, p.id, idea.id);
  });
}

function renderMergedDots(m){
  if(view.mergedMode==="avg"){
    state.ideas.forEach(idea=>{
      let sx=0, sy=0, n=0;
      state.people.forEach(p=>{
        const pos = (state.placements[p.id]||{})[idea.id];
        if(pos){ sx+=pos.x; sy+=pos.y; n++; }
      });
      if(!n) return;
      makeDot(m, {
        className:"avg", ideaId:idea.id, text:abbrev(idea.name),
        label:ideaLabel(idea), badge:`${n}/${state.people.length}`,
        pos:{x:sx/n, y:sy/n}
      });
    });
  }else{
    state.people.forEach(p=>{
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
