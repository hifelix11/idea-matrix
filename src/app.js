(function(){
  "use strict";

  const PALETTE = ["#7B61FF","#FF6B4A","#00A876","#E84C8B","#1F8FFF","#F5A800","#254F1A","#8A4FFF","#00B8C4","#C0392B"];

  let state = {
    xLabel: "Hype — fun & interest →",
    yLabel: "Payoff — feasibility, money, market →",
    people: [],
    ideas: [],
    placements: {} // personId -> ideaId -> {x,y} (0..1, y up)
  };

  let currentTab = "everyone";   // "everyone" or personId
  let mergedMode = "avg";        // "avg" | "all"
  let saveTimer = null;
  let dirty = false;             // local change not yet written to Firebase
  let dragging = false;          // a dot is mid-drag
  let pendingRemote = null;      // a friend's update waiting until you're idle
  let boardRef = null;           // Firebase reference (null = local-only mode)

  /* ---------------- storage ----------------
     The board is one JSON object (`state`), stored in the Firebase
     Realtime Database — shared & live for everyone with the link.
     Without a Firebase config it's in-memory only (Export JSON to
     keep a copy).
  ------------------------------------------------------------------ */
  const hasFirebase = !!(window.firebase && FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL);

  /* Firebase drops empty arrays/objects, so restore them on the way in. */
  function normalize(s){
    if(!s || typeof s !== "object") return null;
    s.people = Array.isArray(s.people) ? s.people : [];
    s.ideas = Array.isArray(s.ideas) ? s.ideas : [];
    s.placements = (s.placements && typeof s.placements === "object") ? s.placements : {};
    s.xLabel = s.xLabel || "Hype →";
    s.yLabel = s.yLabel || "Payoff →";
    return s;
  }
  function validState(s){ return !!normalize(s); }

  function userIsBusy(){
    const a = document.activeElement;
    return dragging || dirty ||
           (a && (a.tagName === "INPUT" || a.isContentEditable));
  }

  function applyRemote(s){
    if(JSON.stringify(s) === JSON.stringify(state)) return;
    state = s;
    if(currentTab !== "everyone" && !person(currentTab)) currentTab = "everyone";
    render();
  }

  async function loadState(){
    if(hasFirebase){
      firebase.initializeApp(FIREBASE_CONFIG);
      boardRef = firebase.database().ref("boards/" + BOARD_ID);
      boardRef.on("value", snap=>{
        const s = normalize(snap.val());
        if(!s){
          // brand-new board: seed it with the defaults
          if(snap.val() === null) boardRef.set(state).catch(()=>setSyncBadge(false));
          return;
        }
        setSyncBadge(true);
        if(userIsBusy()){ pendingRemote = s; return; }
        applyRemote(s);
      }, ()=> setSyncBadge(false));
      // apply a friend's update once you're idle again
      setInterval(()=>{
        if(pendingRemote && !userIsBusy()){
          applyRemote(pendingRemote);
          pendingRemote = null;
        }
      }, 800);
    }else{
      setSyncBadge(false);
    }
  }

  function scheduleSave(){
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async ()=>{
      if(boardRef){
        try{
          await boardRef.set(state);
          dirty = false;
          setSyncBadge(true);
        }catch(e){ setSyncBadge(false); }
      }else{
        dirty = false;
      }
    }, 400);
  }

  function setSyncBadge(ok){
    const b = document.getElementById("syncBadge");
    const label = b.querySelector("span");
    if(hasFirebase){
      b.classList.toggle("on", !!ok);
      label.textContent = ok ? "live · shared with the team" : "connection lost — retrying";
    }else{
      label.textContent = "not saved — use Export JSON";
    }
  }
  function touched(){ scheduleSave(); }

  /* ---------------- export JSON ---------------- */
  document.getElementById("exportBtn").onclick = ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "idea-matrix-" + new Date().toISOString().slice(0,10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ---------------- helpers ---------------- */
  const uid = () => Math.random().toString(36).slice(2,9);
  const person = id => state.people.find(p=>p.id===id);
  const ideaColor = id => PALETTE[ Math.max(0, state.ideas.findIndex(i=>i.id===id)) % PALETTE.length ];
  const initials = name => name.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const abbrev = name => name.trim().slice(0,3).toUpperCase();
  const getPl = pid => (state.placements[pid] = state.placements[pid] || {});
  const esc = s => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  /* ---------------- tabs ---------------- */
  function renderTabs(){
    const el = document.getElementById("tabs");
    el.innerHTML = "";

    const all = document.createElement("button");
    all.className = "tab everyone" + (currentTab==="everyone" ? " active" : "");
    all.textContent = "Everyone";
    all.onclick = ()=>{ currentTab="everyone"; render(); };
    el.appendChild(all);

    state.people.forEach(p=>{
      const t = document.createElement("button");
      t.className = "tab" + (currentTab===p.id ? " active" : "");
      t.innerHTML = esc(p.name) + (state.people.length>1 ? '<span class="x" title="Remove person">×</span>' : "");
      t.onclick = e=>{
        if(e.target.classList.contains("x")){
          if(confirm(`Remove ${p.name} and their dots?`)){
            state.people = state.people.filter(x=>x.id!==p.id);
            delete state.placements[p.id];
            if(currentTab===p.id) currentTab="everyone";
            touched(); render();
          }
          return;
        }
        currentTab = p.id; render();
      };
      t.ondblclick = e=>{
        if(e.target.classList.contains("x")) return;
        const n = prompt("Rename person:", p.name);
        if(n && n.trim()){ p.name = n.trim(); touched(); render(); }
      };
      el.appendChild(t);
    });

    const add = document.createElement("button");
    add.className = "tab add";
    add.textContent = "+ Add person";
    add.onclick = ()=>{
      const n = prompt("Who's joining?");
      if(n && n.trim()){
        const p = {id:uid(), name:n.trim()};
        state.people.push(p);
        currentTab = p.id;
        touched(); render();
      }
    };
    el.appendChild(add);
  }

  /* ---------------- matrix ---------------- */
  function renderMatrix(){
    const m = document.getElementById("matrix");
    m.querySelectorAll(".dot").forEach(d=>d.remove());

    const title = document.getElementById("matrixTitle");
    const hint = document.getElementById("matrixHint");
    const toggle = document.getElementById("viewToggle");

    if(currentTab==="everyone"){
      title.textContent = "Everyone's matrix";
      toggle.style.display = "inline-flex";
      toggle.querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.dataset.mode===mergedMode));
      hint.textContent = "";
      renderMergedDots(m);
    }else{
      const p = person(currentTab);
      title.textContent = p.name + "'s matrix";
      toggle.style.display = "none";
      hint.textContent = "drag dots to move · drag out to remove";
      renderPersonDots(m, p);
    }

    document.getElementById("axisX").textContent = state.xLabel;
    document.getElementById("axisY").textContent = state.yLabel;
  }

  function posToStyle(dot, pos){
    dot.style.left = (pos.x*100) + "%";
    dot.style.top  = ((1-pos.y)*100) + "%";
  }

  function renderPersonDots(m, p){
    const pl = getPl(p.id);
    state.ideas.forEach(idea=>{
      const pos = pl[idea.id];
      if(!pos) return;
      const d = document.createElement("div");
      d.className = "dot";
      d.style.background = ideaColor(idea.id);
      d.textContent = abbrev(idea.name);
      d.innerHTML += `<span class="dot-label">${esc(idea.name)}${idea.desc ? " — " + esc(idea.desc) : ""}</span>`;
      posToStyle(d, pos);
      enableDrag(d, m, p.id, idea.id);
      m.appendChild(d);
    });
  }

  function renderMergedDots(m){
    if(mergedMode==="avg"){
      state.ideas.forEach(idea=>{
        let sx=0, sy=0, n=0;
        state.people.forEach(p=>{
          const pos = (state.placements[p.id]||{})[idea.id];
          if(pos){ sx+=pos.x; sy+=pos.y; n++; }
        });
        if(!n) return;
        const d = document.createElement("div");
        d.className = "dot avg";
        d.style.background = ideaColor(idea.id);
        d.textContent = abbrev(idea.name);
        d.innerHTML += `<span class="badge">${n}/${state.people.length}</span>
                        <span class="dot-label">${esc(idea.name)} — average of ${n}</span>`;
        posToStyle(d, {x:sx/n, y:sy/n});
        m.appendChild(d);
      });
    }else{
      state.people.forEach(p=>{
        const pl = state.placements[p.id]||{};
        state.ideas.forEach(idea=>{
          const pos = pl[idea.id];
          if(!pos) return;
          const d = document.createElement("div");
          d.className = "dot small";
          d.style.background = ideaColor(idea.id);
          d.textContent = initials(p.name);
          d.innerHTML += `<span class="dot-label">${esc(idea.name)} — ${esc(p.name)}</span>`;
          posToStyle(d, pos);
          m.appendChild(d);
        });
      });
    }
  }

  /* drag */
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

  /* merged toggle */
  document.getElementById("viewToggle").addEventListener("click", e=>{
    const b = e.target.closest("button"); if(!b) return;
    mergedMode = b.dataset.mode; render();
  });

  /* editable titles / axes */
  function bindEditable(id, apply){
    const el = document.getElementById(id);
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); el.blur(); } });
    el.addEventListener("blur", ()=>{
      const v = el.textContent.trim();
      if(v){ apply(v); touched(); }
      render();
    });
  }
  bindEditable("axisX", v=> state.xLabel = v);
  bindEditable("axisY", v=> state.yLabel = v);

  /* ---------------- idea list ---------------- */
  function renderIdeas(){
    const list = document.getElementById("ideaList");
    const sub  = document.getElementById("ideasSub");
    list.innerHTML = "";

    if(currentTab==="everyone"){
      sub.textContent = "Pick a person's tab to place dots.";
    }else{
      sub.textContent = "Tap + to drop a dot in the middle, then drag it.";
    }

    if(!state.ideas.length){
      list.innerHTML = '<div class="empty">No ideas yet — add your first one below.</div>';
      return;
    }

    state.ideas.forEach((idea, idx)=>{
      const row = document.createElement("div");
      row.className = "idea-row";

      const placedBy = state.people.filter(p=>(state.placements[p.id]||{})[idea.id]).length;

      let actionHtml;
      if(currentTab==="everyone"){
        actionHtml = `<span class="stat">${placedBy}/${state.people.length} rated</span>`;
      }else{
        const placed = !!(getPl(currentTab)[idea.id]);
        actionHtml = `<button class="idea-act ${placed?'placed':''}" title="${placed?'Remove from matrix':'Place in the middle of the matrix'}">${placed?'✓':'+'}</button>`;
      }

      row.innerHTML = `
        <span class="swatch" style="background:${ideaColor(idea.id)}"></span>
        <span class="name" title="Double-click to edit">${idx+1}. ${esc(idea.name)}${idea.desc ? `<span class="desc">${esc(idea.desc)}</span>` : ""}</span>
        ${actionHtml}
        <button class="idea-del" title="Delete idea">✕</button>`;

      const act = row.querySelector(".idea-act");
      if(act){
        act.onclick = ()=>{
          const pl = getPl(currentTab);
          if(pl[idea.id]) delete pl[idea.id];
          else pl[idea.id] = {x:0.5, y:0.5};
          touched(); render();
        };
      }
      row.querySelector(".name").ondblclick = ()=>{
        const n = prompt("Rename idea:", idea.name);
        if(n && n.trim()) idea.name = n.trim();
        const d = prompt("Edit description:", idea.desc || "");
        if(d !== null) idea.desc = d.trim();
        touched(); render();
      };
      row.querySelector(".idea-del").onclick = ()=>{
        if(!confirm(`Delete "${idea.name}" for everyone?`)) return;
        state.ideas = state.ideas.filter(i=>i.id!==idea.id);
        Object.values(state.placements).forEach(pl=>delete pl[idea.id]);
        touched(); render();
      };
      list.appendChild(row);
    });
  }

  function addIdea(){
    const inp = document.getElementById("ideaInput");
    const dinp = document.getElementById("ideaDescInput");
    const v = inp.value.trim();
    if(!v) return;
    state.ideas.push({id:uid(), name:v, desc:dinp.value.trim()});
    inp.value = "";
    dinp.value = "";
    touched(); render();
    inp.focus();
  }
  document.getElementById("ideaAddBtn").onclick = addIdea;
  document.getElementById("ideaInput").addEventListener("keydown", e=>{ if(e.key==="Enter") addIdea(); });
  document.getElementById("ideaDescInput").addEventListener("keydown", e=>{ if(e.key==="Enter") addIdea(); });

  /* ---------------- render ---------------- */
  function render(){
    renderTabs();
    renderMatrix();
    renderIdeas();
  }

  loadState().then(render);
  render();
})();
