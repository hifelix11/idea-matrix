/* board state + persistence.
   The board is one JSON object (`state`), stored in the Firebase
   Realtime Database — shared & live for everyone with the link.
   Without a Firebase config it's in-memory only (Export JSON to
   keep a copy). */

import { view, render } from "./view.js";

export let state = {
  people: [],
  ideas: [],
  placements: {} // personId -> ideaId -> {x,y} (0..1, y up)
};

const PALETTE = ["#7B61FF","#FF6B4A","#00A876","#E84C8B","#1F8FFF","#F5A800","#254F1A","#8A4FFF","#00B8C4","#C0392B"];

export const person = id => state.people.find(p=>p.id===id);
export const getPl = pid => (state.placements[pid] = state.placements[pid] || {});
export const ideaColor = id => PALETTE[ Math.max(0, state.ideas.findIndex(i=>i.id===id)) % PALETTE.length ];

const hasFirebase = !!(window.firebase && FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL);

let boardRef = null;        // Firebase reference (null = in-memory mode)
let saveTimer = null;
let dirty = false;          // local change not yet written to Firebase
let pendingRemote = null;   // a friend's update waiting until you're idle
let isBusyExtra = () => false;

/* Firebase drops empty arrays/objects, so restore them on the way in. */
function normalize(s){
  if(!s || typeof s !== "object") return null;
  s.people = Array.isArray(s.people) ? s.people : [];
  s.ideas = Array.isArray(s.ideas) ? s.ideas : [];
  s.placements = (s.placements && typeof s.placements === "object") ? s.placements : {};
  return s;
}

function userIsBusy(){
  const a = document.activeElement;
  return dirty || isBusyExtra() ||
         (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable));
}

function applyRemote(s){
  if(JSON.stringify(s) === JSON.stringify(state)) return;
  state = s;
  if(view.currentTab !== "everyone" && !person(view.currentTab)) view.currentTab = "everyone";
  render();
}

export function initStore({ isBusy } = {}){
  if(isBusy) isBusyExtra = isBusy;
  if(!hasFirebase) return;

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

/* call after every local change — debounced write to Firebase */
export function touched(){
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    if(boardRef){
      try{ await boardRef.set(state); }
      catch(e){ console.error("save failed", e); }
    }
    dirty = false;
  }, 400);
}
