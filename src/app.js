(function(){
  "use strict";

  const PALETTE = ["#7B61FF","#FF6B4A","#00A876","#E84C8B","#1F8FFF","#F5A800","#254F1A","#8A4FFF","#00B8C4","#C0392B"];

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

  let state = {
    people: [],
    ideas: [],
    placements: {} // personId -> ideaId -> {x,y} (0..1, y up)
  };

  let currentTab = "everyone";   // "everyone" or personId
  let mergedMode = "avg";        // "avg" | "all"
  let editingIdeaId = null;      // idea loaded into the add form for editing
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
    delete s.xLabel;
    delete s.yLabel;
    return s;
  }
  function validState(s){ return !!normalize(s); }

  function userIsBusy(){
    const a = document.activeElement;
    return dragging || dirty ||
           (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable));
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
          if(snap.val() === null) boardRef.set(state).catch(()=>{});
          return;
        }
        if(userIsBusy()){ pendingRemote = s; return; }
        applyRemote(s);
      });
      // apply a friend's update once you're idle again
      setInterval(()=>{
        if(pendingRemote && !userIsBusy()){
          applyRemote(pendingRemote);
          pendingRemote = null;
        }
      }, 800);
    }
  }

  function scheduleSave(){
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async ()=>{
      if(boardRef){
        try{
          await boardRef.set(state);
        }catch(e){ console.error("save failed", e); }
        dirty = false;
      }else{
        dirty = false;
      }
    }, 400);
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
  const abbrev = name => name.trim().split(/\s+/).slice(0,3).map(w=>w[0]).join("").toUpperCase();
  const getPl = pid => (state.placements[pid] = state.placements[pid] || {});
  const esc = s => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const arrows = s => s.replace(/->/g, "→"); // typed "->" becomes a real arrow

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
                        <span class="dot-label">${esc(idea.name)}${idea.desc ? " — " + esc(idea.desc) : ""}</span>`;
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

  /* ---------------- idea list ---------------- */
  function renderIdeas(){
    const list = document.getElementById("ideaList");
    const sub  = document.getElementById("ideasSub");
    list.innerHTML = "";

    if(editingIdeaId && !state.ideas.some(i=>i.id===editingIdeaId)) editingIdeaId = null;
    document.getElementById("ideaAddBtn").textContent = editingIdeaId ? "Save" : "Add";

    if(currentTab==="everyone"){
      sub.textContent = "Pick a person's tab to place dots.";
    }else{
      sub.textContent = "Tap + to drop a dot in the middle, then drag it.";
    }

    if(!state.ideas.length){
      list.innerHTML = '<div class="empty">No ideas yet — add your first one below.</div>';
      return;
    }

    /* order: not on this matrix -> placed, not fully rated -> fully rated, then A-Z */
    const pl = currentTab==="everyone" ? null : getPl(currentTab);
    const rated = idea => state.people.filter(p=>(state.placements[p.id]||{})[idea.id]).length;
    const fullyRated = idea => state.people.length>0 && rated(idea)===state.people.length ? 1 : 0;
    const sorted = state.ideas.slice().sort((a,b)=>{
      if(pl && !!pl[a.id] !== !!pl[b.id]) return pl[a.id] ? 1 : -1;
      if(fullyRated(a) !== fullyRated(b)) return fullyRated(a) - fullyRated(b);
      return a.name.localeCompare(b.name);
    });

    sorted.forEach(idea=>{
      const row = document.createElement("div");
      row.className = "idea-row";

      const placedBy = rated(idea);

      let actionHtml;
      if(currentTab==="everyone"){
        actionHtml = `<span class="stat">${placedBy}/${state.people.length} rated</span>`;
      }else{
        const placed = !!(getPl(currentTab)[idea.id]);
        actionHtml = `<button class="idea-act ${placed?'placed':''}" title="${placed?'Remove from matrix':'Place in the middle of the matrix'}">${placed?'✓':'+'}</button>`;
      }

      row.innerHTML = `
        <span class="swatch" style="background:${ideaColor(idea.id)}"></span>
        <span class="name" title="Double-click to edit">${esc(idea.name)}${idea.desc ? `<span class="desc">${esc(idea.desc)}</span>` : ""}</span>
        ${actionHtml}
        <button class="idea-feas ${idea.feasibility?'done':''}" title="${idea.feasibility?'Show feasibility check':'Run AI feasibility check'}">📈</button>
        <button class="idea-edit" title="Edit idea">✎</button>
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
      row.querySelector(".name").ondblclick = ()=> startEdit(idea);
      row.querySelector(".idea-edit").onclick = ()=> startEdit(idea);
      row.querySelector(".idea-feas").onclick = ()=>{
        if(idea.feasibility){ feasIdeaId = idea.id; openFeasModal(idea); }
        else if(confirm(`Run an AI feasibility check for "${idea.name}"? This uses your OpenRouter credits.`)) runFeasibility(idea);
      };
      row.querySelector(".idea-del").onclick = ()=>{
        if(!confirm(`Delete "${idea.name}" for everyone?`)) return;
        state.ideas = state.ideas.filter(i=>i.id!==idea.id);
        Object.values(state.placements).forEach(pl=>delete pl[idea.id]);
        if(editingIdeaId===idea.id) editingIdeaId = null;
        touched(); render();
      };
      list.appendChild(row);
    });
  }

  function startEdit(idea){
    editingIdeaId = idea.id;
    document.getElementById("ideaInput").value = idea.name;
    document.getElementById("ideaDescInput").value = idea.desc || "";
    render();
    document.getElementById("ideaInput").focus();
  }

  function cancelEdit(){
    if(!editingIdeaId) return;
    editingIdeaId = null;
    document.getElementById("ideaInput").value = "";
    document.getElementById("ideaDescInput").value = "";
    render();
  }

  function addIdea(){
    const inp = document.getElementById("ideaInput");
    const dinp = document.getElementById("ideaDescInput");
    const v = inp.value.trim();
    if(!v) return;
    const editing = editingIdeaId && state.ideas.find(i=>i.id===editingIdeaId);
    if(editing){
      editing.name = arrows(v);
      editing.desc = arrows(dinp.value.trim());
    }else{
      state.ideas.push({id:uid(), name:arrows(v), desc:arrows(dinp.value.trim())});
    }
    editingIdeaId = null;
    inp.value = "";
    dinp.value = "";
    touched(); render();
    inp.focus();
  }
  document.getElementById("ideaAddBtn").onclick = addIdea;
  document.getElementById("ideaInput").addEventListener("keydown", e=>{
    if(e.key==="Enter") addIdea();
    if(e.key==="Escape") cancelEdit();
  });
  // Enter saves, Shift+Enter makes a new line
  document.getElementById("ideaDescInput").addEventListener("keydown", e=>{
    if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); addIdea(); }
    if(e.key==="Escape") cancelEdit();
  });

  /* ---------------- feasibility check (OpenRouter) ----------------
     The API key is asked for once and kept in this browser only —
     it is never written to the shared board or the repo.          */
  let feasIdeaId = null; // idea currently shown in the modal

  function getOpenRouterKey(){
    let k = null;
    try{ k = window.localStorage.getItem("openrouter-key"); }catch(e){}
    if(!k){
      k = prompt("Paste your OpenRouter API key (sk-or-…).\nIt is stored only in this browser.");
      if(!k || !k.trim()) return null;
      k = k.trim();
      try{ window.localStorage.setItem("openrouter-key", k); }catch(e){}
    }
    return k;
  }

  function openFeasModal(idea, status){
    document.getElementById("feasTitle").textContent = idea.name;
    const body = document.getElementById("feasBody");
    if(status){
      body.textContent = status;
    }else if(idea.feasibility){
      body.textContent = idea.feasibility.text +
        "\n\n— checked " + new Date(idea.feasibility.ts).toLocaleDateString();
    }else{
      body.textContent = "No check yet.";
    }
    document.getElementById("feasModal").hidden = false;
  }
  function closeFeasModal(){
    document.getElementById("feasModal").hidden = true;
    feasIdeaId = null;
  }
  document.getElementById("feasClose").onclick = closeFeasModal;
  document.getElementById("feasModal").addEventListener("click", e=>{
    if(e.target.id === "feasModal") closeFeasModal();
  });
  document.getElementById("feasRerun").onclick = ()=>{
    const idea = state.ideas.find(i=>i.id===feasIdeaId);
    if(idea && confirm("Run a new feasibility check? This uses your OpenRouter credits.")) runFeasibility(idea);
  };

  async function runFeasibility(idea){
    const key = getOpenRouterKey();
    if(!key) return;
    feasIdeaId = idea.id;
    openFeasModal(idea, "Researching with web search — this can take a minute…");

    const promptText =
`You are a pragmatic startup analyst. Do a quick feasibility check on this idea:

Idea: ${idea.name}
${idea.desc ? "Description: " + idea.desc : ""}

Use web search to ground your answer in real, current data. Reply in plain text (no markdown syntax) with exactly these sections:

MARKET SIZE
TAM, SAM and SOM with rough numbers and one line of reasoning each.

SIMILAR COMPANIES
5-8 companies or products that already do something similar: name — what they do — how this idea could differ.

VERDICT
2-3 sentences on overall feasibility and the single biggest risk.`;

    try{
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: (typeof OPENROUTER_MODEL !== "undefined" && OPENROUTER_MODEL) || "moonshotai/kimi-k3:online",
          messages: [{ role: "user", content: promptText }]
        })
      });
      if(res.status === 401){
        try{ window.localStorage.removeItem("openrouter-key"); }catch(e){}
        throw new Error("invalid API key — it was cleared, click 📈 to enter it again");
      }
      if(!res.ok) throw new Error("OpenRouter answered " + res.status);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if(!text) throw new Error("empty response");

      const target = state.ideas.find(i=>i.id===idea.id);
      if(target){
        target.feasibility = { text: text.trim(), ts: Date.now() };
        touched(); render();
        if(feasIdeaId === idea.id) openFeasModal(target);
      }
    }catch(err){
      if(feasIdeaId === idea.id) openFeasModal(idea, "Check failed: " + err.message);
    }
  }

  /* ---------------- render ---------------- */
  function render(){
    renderTabs();
    renderMatrix();
    renderIdeas();
  }

  loadState().then(render);
  render();
})();
