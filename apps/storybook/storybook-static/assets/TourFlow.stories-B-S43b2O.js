import{j as h}from"./jsx-runtime-Z5uAzocK.js";import{r as g}from"./index-pP6CS22B.js";import"./index-Bvak3XBe.js";import"./_commonjsHelpers-Cpj98o6Y.js";var at=class{constructor(t,e){if(this._listeners=new Set,!(t.initial in t.states))throw new Error(`[GuideFlow FSM] Initial state "${t.initial}" does not exist in flow states: [${Object.keys(t.states).join(", ")}]`);this._ctx={flow:t,context:e??t.context??{},currentState:t.initial,stepIndex:0,history:[t.initial]},this._callEntry(t.initial)}get state(){return this._ctx.currentState}get stepIndex(){return this._ctx.stepIndex}get context(){return this._ctx.context}matches(t){return this._ctx.currentState===t}get currentSteps(){var t;return((t=this._ctx.flow.states[this._ctx.currentState])==null?void 0:t.steps)??[]}get currentStep(){return this.currentSteps[this._ctx.stepIndex]??null}get isFinal(){var t;return((t=this._ctx.flow.states[this._ctx.currentState])==null?void 0:t.final)===!0}get totalSteps(){return this.currentSteps.length}send(t){const e=this._ctx.flow.states[this._ctx.currentState];if(!(e!=null&&e.on))return!1;const r=e.on[t];if(!r)return!1;const s=typeof r=="string"?r:r.target,i=typeof r=="object"?r.guard:void 0;return i&&!i(this._ctx.context)?!1:(this._callExit(this._ctx.currentState),this._ctx.history.push(s),this._ctx.currentState=s,this._ctx.stepIndex=0,this._callEntry(s),this._notify(),!0)}nextStep(){const t=this.currentSteps;return this._ctx.stepIndex<t.length-1?(this._ctx.stepIndex++,this._notify(),!0):this.send("NEXT")}prevStep(){return this._ctx.stepIndex>0?(this._ctx.stepIndex--,this._notify(),!0):!1}goToStep(t){const e=this.currentSteps;return t<0||t>=e.length?!1:(this._ctx.stepIndex=t,this._notify(),!0)}goToStepById(t){const r=this.currentSteps.findIndex(s=>s.id===t);return r===-1?!1:this.goToStep(r)}updateContext(t){this._ctx.context={...this._ctx.context,...t}}snapshot(){return{state:this._ctx.currentState,stepIndex:this._ctx.stepIndex,context:{...this._ctx.context}}}restore(t){t.state in this._ctx.flow.states&&(this._ctx.currentState=t.state,this._ctx.stepIndex=t.stepIndex,t.context&&(this._ctx.context=t.context),this._notify())}subscribe(t){return this._listeners.add(t),()=>this._listeners.delete(t)}_notify(){this._listeners.forEach(t=>t({...this._ctx}))}_callEntry(t){var e,r;(r=(e=this._ctx.flow.states[t])==null?void 0:e.onEntry)==null||r.call(e,this._ctx.context)}_callExit(t){var e,r;(r=(e=this._ctx.flow.states[t])==null?void 0:e.onExit)==null||r.call(e,this._ctx.context)}},p=()=>typeof window<"u"&&typeof document<"u",H=new Set;function $(t,e,r){if(!p()||H.has(e))return;const s=document.createElement("style");s.setAttribute("data-gf",e),r&&s.setAttribute("nonce",r),s.textContent=t,document.head.appendChild(s),H.add(e)}function ct(t){p()&&(document.querySelectorAll(`style[data-gf="${t}"]`).forEach(e=>{var r;return(r=e.parentNode)==null?void 0:r.removeChild(e)}),H.delete(t))}var lt=0;function st(t="gf"){return`${t}-${++lt}`}var B="gf-spotlight",dt=`
[data-gf-overlay] {
  position: fixed;
  inset: 0;
  z-index: 999998;
  pointer-events: all;
  transition: opacity 200ms ease;
}
[data-gf-overlay].gf-clickthrough {
  pointer-events: none;
}
[data-gf-overlay] svg {
  width: 100%;
  height: 100%;
}
[data-gf-spotlight-cutout] {
  position: fixed;
  z-index: 999999;
  pointer-events: none;
  border-radius: var(--gf-spotlight-radius, 4px);
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, var(--gf-overlay-opacity, 0.5));
  transition: 
    top 200ms ease,
    left 200ms ease,
    width 200ms ease,
    height 200ms ease,
    border-radius 200ms ease;
}
`,ht=class{constructor(t={}){this._overlayEl=null,this._cutoutEl=null,this._currentTarget=null,this._resizeObserver=null,this._scrollHandler=null,this._options={padding:t.padding??8,borderRadius:t.borderRadius??4,animated:t.animated??!0,overlayColor:t.overlayColor??"rgba(0,0,0,0)",overlayOpacity:t.overlayOpacity??.5,nonce:t.nonce??""},this._id=st("spotlight")}show(t,e){p()&&(e&&(this._options={...this._options,...e}),$(dt,B,this._options.nonce),this._ensureElements(),this._currentTarget=t,this._update(),this._attachObservers())}hide(){this._overlayEl&&(this._overlayEl.style.opacity="0"),this._detachObservers(),this._currentTarget=null}destroy(){var t,e,r,s;this._detachObservers(),(e=(t=this._overlayEl)==null?void 0:t.parentNode)==null||e.removeChild(this._overlayEl),(s=(r=this._cutoutEl)==null?void 0:r.parentNode)==null||s.removeChild(this._cutoutEl),this._overlayEl=null,this._cutoutEl=null,this._currentTarget=null,ct(B)}setClickThrough(t){this._overlayEl&&(t?this._overlayEl.classList.add("gf-clickthrough"):this._overlayEl.classList.remove("gf-clickthrough"))}_ensureElements(){this._overlayEl||(this._overlayEl=document.createElement("div"),this._overlayEl.setAttribute("data-gf-overlay",this._id),this._overlayEl.style.cssText=`
        position: fixed;
        inset: 0;
        z-index: 999998;
        pointer-events: all;
        transition: opacity 200ms ease;
      `,document.body.appendChild(this._overlayEl)),this._cutoutEl||(this._cutoutEl=document.createElement("div"),this._cutoutEl.setAttribute("data-gf-spotlight-cutout",this._id),this._cutoutEl.style.cssText=`
        position: fixed;
        z-index: 999999;
        pointer-events: none;
        transition: top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease, border-radius 200ms ease;
      `,document.body.appendChild(this._cutoutEl)),this._overlayEl.style.opacity="1"}_update(){if(!this._cutoutEl)return;const t=this._options.padding,e=this._options.borderRadius,r=this._options.overlayOpacity;if(!this._currentTarget){this._cutoutEl.style.cssText+=`
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        box-shadow: none;
      `,this._overlayEl&&(this._overlayEl.style.background=`rgba(0,0,0,${r})`);return}const s=this._currentTarget.getBoundingClientRect();this._cutoutEl.style.top=`${s.top-t}px`,this._cutoutEl.style.left=`${s.left-t}px`,this._cutoutEl.style.width=`${s.width+t*2}px`,this._cutoutEl.style.height=`${s.height+t*2}px`,this._cutoutEl.style.borderRadius=`${e}px`,this._cutoutEl.style.boxShadow=`0 0 0 100vmax rgba(0,0,0,${r})`,this._overlayEl&&(this._overlayEl.style.background="transparent")}_attachObservers(){this._detachObservers(),typeof ResizeObserver<"u"&&(this._resizeObserver=new ResizeObserver(()=>this._update()),this._currentTarget&&this._resizeObserver.observe(this._currentTarget),this._resizeObserver.observe(document.documentElement)),this._scrollHandler=()=>this._update(),window.addEventListener("scroll",this._scrollHandler,{passive:!0,capture:!0}),window.addEventListener("resize",this._scrollHandler,{passive:!0})}_detachObservers(){var t;(t=this._resizeObserver)==null||t.disconnect(),this._resizeObserver=null,this._scrollHandler&&(window.removeEventListener("scroll",this._scrollHandler,{capture:!0}),window.removeEventListener("resize",this._scrollHandler),this._scrollHandler=null)}},R={top:["top","bottom","right","left","center"],"top-start":["top-start","bottom-start","right","left","center"],"top-end":["top-end","bottom-end","right","left","center"],bottom:["bottom","top","right","left","center"],"bottom-start":["bottom-start","top-start","right","left","center"],"bottom-end":["bottom-end","top-end","right","left","center"],left:["left","right","bottom","top","center"],"left-start":["left-start","right-start","bottom","top","center"],"left-end":["left-end","right-end","bottom","top","center"],right:["right","left","bottom","top","center"],"right-start":["right-start","left-start","bottom","top","center"],"right-end":["right-end","left-end","bottom","top","center"],center:["center"]},f=12;function G(t,e,r){const{x:s,y:i,width:n,height:o}=e,{width:c,height:a}=r;switch(t){case"top":return{x:s+n/2-c/2,y:i-a-f,arrowX:c/2};case"top-start":return{x:s,y:i-a-f,arrowX:Math.min(24,c*.25)};case"top-end":return{x:s+n-c,y:i-a-f,arrowX:c-Math.min(24,c*.25)};case"bottom":return{x:s+n/2-c/2,y:i+o+f,arrowX:c/2};case"bottom-start":return{x:s,y:i+o+f,arrowX:Math.min(24,c*.25)};case"bottom-end":return{x:s+n-c,y:i+o+f,arrowX:c-Math.min(24,c*.25)};case"left":return{x:s-c-f,y:i+o/2-a/2,arrowY:a/2};case"left-start":return{x:s-c-f,y:i,arrowY:Math.min(24,a*.25)};case"left-end":return{x:s-c-f,y:i+o-a,arrowY:a-Math.min(24,a*.25)};case"right":return{x:s+n+f,y:i+o/2-a/2,arrowY:a/2};case"right-start":return{x:s+n+f,y:i,arrowY:Math.min(24,a*.25)};case"right-end":return{x:s+n+f,y:i+o-a,arrowY:a-Math.min(24,a*.25)};case"center":{const d=typeof window<"u"?window.innerWidth:1280,u=typeof window<"u"?window.innerHeight:800;return{x:d/2-c/2,y:u/2-a/2}}}}function pt(t,e,r){return t.x>=r.x&&t.y>=r.y&&t.x+e.width<=r.x+r.width&&t.y+e.height<=r.y+r.height}function ut(t,e,r){return{x:Math.max(r.x+8,Math.min(t.x,r.x+r.width-e.width-8)),y:Math.max(r.y+8,Math.min(t.y,r.y+r.height-e.height-8))}}function ft(t,e,r="bottom",s){const i=s??{x:0,y:0,width:typeof window<"u"?window.innerWidth:1280,height:typeof window<"u"?window.innerHeight:800},n=R[r]??R.bottom;for(const a of n){const d=G(a,t,e);if(pt(d,e,i))return{...d,placement:a}}const o=G("center",t,e);return{...ut(o,e,i),placement:"center"}}function gt(t){t.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"})}function _t(){return typeof window>"u"?{x:0,y:0,width:1280,height:800}:{x:window.scrollX,y:window.scrollY,width:window.innerWidth,height:window.innerHeight}}var A=class{constructor(){this._listeners=new Map}on(t,e){return this._listeners.has(t)||this._listeners.set(t,new Set),this._listeners.get(t).add(e),()=>this.off(t,e)}once(t,e){const r=s=>{e(s),this.off(t,r)};this.on(t,r)}off(t,e){var r;(r=this._listeners.get(t))==null||r.delete(e)}emit(t,e){var r;(r=this._listeners.get(t))==null||r.forEach(s=>s(e))}removeAllListeners(t){t?this._listeners.delete(t):this._listeners.clear()}},vt=class extends A{constructor(t){super(),this._machine=null,this._active=!1,this._flow=null,this._keyboardHandler=null,this._currentStep=null,this._currentContent=null,this._stepExitEmitted=!0,this._paused=!1,this._options=t,this._renderer=t.renderer,this._spotlight=new ht(t.spotlight)}get isActive(){return this._active}get currentStepId(){var t,e;return((e=(t=this._machine)==null?void 0:t.currentStep)==null?void 0:e.id)??null}get currentStepIndex(){var t;return((t=this._machine)==null?void 0:t.stepIndex)??0}get totalSteps(){var t;return((t=this._machine)==null?void 0:t.totalSteps)??0}get flowId(){var t;return((t=this._flow)==null?void 0:t.id)??null}get machine(){return this._machine}get currentStep(){return this._currentStep}get currentContent(){return this._currentContent}async start(t,e){this._active&&this._doEnd(!1),this._flow=t,this._machine=new at(t,e??this._options.context),this._active=!0,this.emit("tour:start",{flowId:t.id}),this._log("Tour started:",t.id),this._attachKeyboard(),await this._renderCurrentStep()}async next(){if(!this._machine||!this._active)return;if(this._emitStepExit(),!this._machine.nextStep()||this._machine.isFinal){this._doEnd(!0);return}await this._renderCurrentStep()}async prev(){!this._machine||!this._active||(this._emitStepExit(),this._machine.prevStep(),await this._renderCurrentStep())}async goTo(t){!this._machine||!this._active||(this._machine.goToStepById(t),await this._renderCurrentStep())}async send(t){if(!(!this._machine||!this._active||!this._machine.send(t))){if(this._machine.isFinal){this._emitStepExit(),this._doEnd(!0);return}await this._renderCurrentStep()}}skip(){if(!this._machine||!this._active)return;this._emitStepExit();const t=this._machine.currentStep;t&&this.emit("step:skip",{stepId:t.id}),this._doEnd(!1)}end(){this._doEnd(!1)}pause(){var r,s,i;if(!this._active||this._paused)return;this._paused=!0,this._spotlight.hide(),this._renderer.hideStep();const t=((r=this._flow)==null?void 0:r.id)??"unknown",e=((i=(s=this._machine)==null?void 0:s.currentStep)==null?void 0:i.id)??"";this.emit("tour:pause",{flowId:t,stepId:e})}resume(){var r,s,i;if(!this._active||!this._paused)return;this._paused=!1;const t=((r=this._flow)==null?void 0:r.id)??"unknown",e=((i=(s=this._machine)==null?void 0:s.currentStep)==null?void 0:i.id)??"";this.emit("tour:resume",{flowId:t,stepId:e}),this._renderCurrentStep()}destroy(){this._doEnd(!1),this._spotlight.destroy(),this.removeAllListeners()}async _renderCurrentStep(){if(!this._machine)return;let t=this._machine.currentStep;if(!t)return;const e=this._machine.totalSteps;let r=0;for(;t&&t.showIf&&!t.showIf(this._machine.context);){if(this.emit("step:skip",{stepId:t.id}),r++,r>=e){this._doEnd(!0);return}if(!this._machine.nextStep()||this._machine.isFinal){this._doEnd(!0);return}t=this._machine.currentStep}if(!t)return;const s=await this._resolveContent(t),i=this._resolveTarget(t);i&&t.scrollIntoView!==!1&&(gt(i),await this._sleep(150)),p()&&(this._spotlight.show(i,{...this._options.spotlight,...t.padding!==void 0&&{padding:t.padding}}),this._spotlight.setClickThrough(t.clickThrough??!1)),this._currentStep=t,this._currentContent=s,this._stepExitEmitted=!1,this.emit("step:enter",{stepId:t.id,stepIndex:this._machine.stepIndex,target:i}),this._renderer.renderStep(t,s,this._machine.stepIndex,this._machine.totalSteps)}async _resolveContent(t){return typeof t.content=="function"?await t.content():t.content}_resolveTarget(t){return!p()||t.target==null?null:t.target instanceof Element?t.target:typeof t.target=="string"?document.querySelector(t.target):null}_doEnd(t){var r,s,i,n;if(!this._active)return;this._active=!1,this._emitStepExit(),this._spotlight.hide(),this._renderer.hideStep(),this._detachKeyboard();const e=((r=this._flow)==null?void 0:r.id)??"unknown";if(t)this.emit("tour:complete",{flowId:e});else{const o=((i=(s=this._machine)==null?void 0:s.currentStep)==null?void 0:i.id)??"",c=((n=this._machine)==null?void 0:n.stepIndex)??0;this.emit("tour:abandon",{flowId:e,stepId:o,stepIndex:c})}this._currentStep=null,this._currentContent=null,this._paused=!1,this._machine=null,this._flow=null}_attachKeyboard(){p()&&(this._detachKeyboard(),this._keyboardHandler=t=>{if(this._active)switch(t.key){case"ArrowRight":case"ArrowDown":t.preventDefault(),this.next();break;case"ArrowLeft":case"ArrowUp":t.preventDefault(),this.prev();break;case"Escape":t.preventDefault(),this.skip();break}},document.addEventListener("keydown",this._keyboardHandler))}_detachKeyboard(){this._keyboardHandler&&(document.removeEventListener("keydown",this._keyboardHandler),this._keyboardHandler=null)}_emitStepExit(){var e,r;if(this._stepExitEmitted)return;const t=(e=this._machine)==null?void 0:e.currentStep;t&&this.emit("step:exit",{stepId:t.id,stepIndex:((r=this._machine)==null?void 0:r.stepIndex)??0}),this._stepExitEmitted=!0}_sleep(t){return new Promise(e=>setTimeout(e,t))}_log(...t){this._options.debug&&console.warn("[GuideFlow]",...t)}},mt="gf-hotspot",xt=`
@keyframes gf-pulse {
  0%   { transform: scale(1);   opacity: 1;   }
  50%  { transform: scale(2);   opacity: 0.4; }
  100% { transform: scale(1);   opacity: 1;   }
}
.gf-hotspot {
  position: absolute;
  z-index: 99997;
  pointer-events: all;
  cursor: pointer;
}
.gf-hotspot-beacon {
  width: var(--gf-hotspot-size, 12px);
  height: var(--gf-hotspot-size, 12px);
  border-radius: 50%;
  background: var(--gf-accent-color, #6366f1);
  animation: gf-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  display: block;
}
.gf-hotspot-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--gf-popover-bg, #fff);
  color: var(--gf-popover-text, #111);
  border-radius: var(--gf-border-radius, 8px);
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.4;
  white-space: nowrap;
  max-width: 240px;
  white-space: normal;
  box-shadow: var(--gf-shadow, 0 4px 20px rgba(0,0,0,0.15));
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease;
  z-index: 99998;
}
.gf-hotspot:hover .gf-hotspot-tooltip,
.gf-hotspot:focus-within .gf-hotspot-tooltip {
  opacity: 1;
}
`,yt=0,bt=class extends A{constructor(t){super(),this._hotspots=new Map,this._cleanups=new Map,this._nonce=t}add(t,e={}){if(!p())return"";const r=typeof t=="string"?document.querySelector(t):t;if(!r)return console.warn("[GuideFlow] Hotspot target not found:",t),"";$(xt,mt,this._nonce);const s=`gf-hotspot-${++yt}`,i=this._createBeacon(s,e),n=this._createTooltip(e);i.appendChild(n),this._positionBeacon(i,r),document.body.appendChild(i);const o={id:s,target:r,options:e,beaconEl:i,tooltipEl:n};i.addEventListener("click",()=>this.emit("hotspot:open",{id:s})),i.addEventListener("keydown",a=>{(a.key==="Enter"||a.key===" ")&&(a.preventDefault(),this.emit("hotspot:open",{id:s}))}),this._hotspots.set(s,o);const c=()=>this._positionBeacon(i,r);return window.addEventListener("scroll",c,{passive:!0}),window.addEventListener("resize",c,{passive:!0}),this._cleanups.set(s,()=>{window.removeEventListener("scroll",c),window.removeEventListener("resize",c)}),s}remove(t){var r,s;const e=this._hotspots.get(t);e&&((r=this._cleanups.get(t))==null||r(),this._cleanups.delete(t),(s=e.beaconEl.parentNode)==null||s.removeChild(e.beaconEl),this._hotspots.delete(t))}removeAll(){this._hotspots.forEach((t,e)=>this.remove(e))}get(t){return this._hotspots.get(t)}_createBeacon(t,e){const r=document.createElement("div");r.className="gf-hotspot",r.setAttribute("role","button"),r.setAttribute("tabindex","0"),r.setAttribute("aria-label",e.title??"Guidance hint"),r.setAttribute("data-gf-hotspot-id",t);const s=document.createElement("span");return s.className="gf-hotspot-beacon",e.color&&(s.style.background=e.color),e.size&&(s.style.width=`${e.size}px`,s.style.height=`${e.size}px`),r.appendChild(s),r}_createTooltip(t){const e=document.createElement("div");if(e.className="gf-hotspot-tooltip",e.setAttribute("role","tooltip"),t.title){const r=document.createElement("strong");r.textContent=t.title,e.appendChild(r)}if(t.body){const r=document.createElement("p");r.style.margin="4px 0 0",r.textContent=t.body,e.appendChild(r)}return e}_positionBeacon(t,e){const r=e.getBoundingClientRect(),s=window.scrollX,i=window.scrollY;t.style.position="absolute",t.style.left=`${r.right+s-6}px`,t.style.top=`${r.top+i-6}px`}},wt="gf-hint",St=`
.gf-hint-badge {
  position: absolute;
  z-index: 99996;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--gf-accent-color, #6366f1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--gf-font-family, system-ui, sans-serif);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  transition: transform 150ms ease;
  pointer-events: all;
}
.gf-hint-badge:hover,
.gf-hint-badge:focus {
  transform: scale(1.2);
  outline: 2px solid var(--gf-accent-color, #6366f1);
  outline-offset: 2px;
}
.gf-hint-tooltip {
  position: absolute;
  background: var(--gf-popover-bg, #fff);
  color: var(--gf-popover-text, #111);
  border-radius: var(--gf-border-radius, 8px);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 220px;
  box-shadow: var(--gf-shadow, 0 4px 20px rgba(0,0,0,0.15));
  z-index: 99997;
  pointer-events: none;
}
`,Et=class extends A{constructor(t){super(),this._hints=new Map,this._visible=!1,this._nonce=t}register(t){p()&&($(St,wt,this._nonce),t.forEach((e,r)=>{this._hints.has(e.id)||this._mount(e,r+1)}))}show(){this._visible=!0,this._hints.forEach(({badgeEl:t})=>{t.style.display="flex"})}hide(){this._visible=!1,this._hints.forEach(({badgeEl:t})=>{t.style.display="none"})}destroy(){this._hints.forEach(({badgeEl:t,scrollCleanup:e})=>{var r;(r=t.parentNode)==null||r.removeChild(t),e()}),this._hints.clear()}_mount(t,e){const r=document.querySelector(t.target);if(!r){console.warn("[GuideFlow] Hint target not found:",t.target);return}const s=document.createElement("div");s.className="gf-hint-badge",s.setAttribute("role","button"),s.setAttribute("tabindex","0"),s.setAttribute("aria-label",`Hint ${e}: ${t.hint}`),s.textContent=t.icon??String(e),this._visible||(s.style.display="none");const i=()=>{const o=r.getBoundingClientRect();s.style.left=`${o.left+window.scrollX+o.width-12}px`,s.style.top=`${o.top+window.scrollY-12}px`};i(),document.body.appendChild(s),s.addEventListener("click",()=>this.emit("hint:click",{id:t.id})),s.addEventListener("keydown",o=>{(o.key==="Enter"||o.key===" ")&&(o.preventDefault(),this.emit("hint:click",{id:t.id}))});const n=()=>i();window.addEventListener("scroll",n,{passive:!0}),window.addEventListener("resize",n,{passive:!0}),this._hints.set(t.id,{step:t,badgeEl:s,tooltipEl:null,scrollCleanup:()=>{window.removeEventListener("scroll",n),window.removeEventListener("resize",n)}})}},j=class{get(t){if(!p())return null;try{const e=localStorage.getItem(t);return e===null?null:JSON.parse(e)}catch{return null}}set(t,e){if(p())try{localStorage.setItem(t,JSON.stringify(e))}catch(r){console.warn("[GuideFlow] LocalStorage write failed:",r)}}remove(t){p()&&localStorage.removeItem(t)}keys(){return p()?Object.keys(localStorage):[]}},kt="guideflow",m="progress",It=1;function Ct(){return new Promise((t,e)=>{const r=indexedDB.open(kt,It);r.onupgradeneeded=()=>{r.result.createObjectStore(m)},r.onsuccess=()=>t(r.result),r.onerror=()=>e(r.error)})}var Tt=class{constructor(){this._dbPromise=null}_db(){return this._dbPromise||(this._dbPromise=Ct()),this._dbPromise}async get(t){if(!p())return null;try{const e=await this._db();return await new Promise((r,s)=>{const n=e.transaction(m,"readonly").objectStore(m).get(t);n.onsuccess=()=>r(n.result??null),n.onerror=()=>s(n.error)})}catch{return null}}async set(t,e){if(p())try{const r=await this._db();await new Promise((s,i)=>{const o=r.transaction(m,"readwrite").objectStore(m).put(e,t);o.onsuccess=()=>s(),o.onerror=()=>i(o.error)})}catch(r){console.warn("[GuideFlow] IndexedDB write failed:",r)}}async remove(t){if(p())try{const e=await this._db();await new Promise((r,s)=>{const n=e.transaction(m,"readwrite").objectStore(m).delete(t);n.onsuccess=()=>r(),n.onerror=()=>s(n.error)})}catch{}}async keys(){if(!p())return[];try{const t=await this._db();return await new Promise((e,r)=>{const i=t.transaction(m,"readonly").objectStore(m).getAllKeys();i.onsuccess=()=>e(i.result??[]),i.onerror=()=>r(i.error)})}catch{return[]}}};function $t(t){return t==="indexedDB"?new Tt:new j}var At=30*24*60*60*1e3,Ft=class{constructor(t={}){!t.driver||t.driver==="localStorage"?this._driver=new j:t.driver==="indexedDB"?this._driver=$t("indexedDB"):this._driver=t.driver,this._keyFn=t.key??(e=>`gf:${e}:progress`),this._ttl=t.ttl??At}async saveSnapshot(t,e){const r=`${this._keyFn(t)}:${e.flowId}:snapshot`,s={value:e,expiresAt:Date.now()+this._ttl};await this._driver.set(r,s)}async loadSnapshot(t,e){const r=`${this._keyFn(t)}:${e}:snapshot`,s=await this._driver.get(r);return s?Date.now()>s.expiresAt?(await this._driver.remove(r),null):s.value:null}async clearSnapshot(t,e){const r=`${this._keyFn(t)}:${e}:snapshot`;await this._driver.remove(r)}async markDismissed(t,e){const r=`${this._keyFn(t)}:${e}:dismissed`,s={value:!0,expiresAt:Date.now()+this._ttl};await this._driver.set(r,s)}async isDismissed(t,e){const r=`${this._keyFn(t)}:${e}:dismissed`,s=await this._driver.get(r);return s?Date.now()>s.expiresAt?(await this._driver.remove(r),!1):s.value:!1}async clearDismissed(t,e){const r=`${this._keyFn(t)}:${e}:dismissed`;await this._driver.remove(r)}async markCompleted(t,e){const r=`${this._keyFn(t)}:completed`,s=await this._driver.get(r)??[];s.includes(e)||(s.push(e),await this._driver.set(r,s))}async getCompletedFlows(t){const e=`${this._keyFn(t)}:completed`;return await this._driver.get(e)??[]}async isCompleted(t,e){return(await this.getCompletedFlows(t)).includes(e)}async resetUser(t){const e=this._keyFn(t);if(this._driver.keys){const s=(await this._driver.keys()).filter(i=>i.startsWith(e));await Promise.all(s.map(i=>this._driver.remove(i)))}else this._driver instanceof j&&typeof localStorage<"u"&&Object.keys(localStorage).filter(s=>s.startsWith(e)).forEach(s=>localStorage.removeItem(s))}},Dt="guideflow:progress",Lt=class extends A{constructor(t){super(),this._channel=null,this._userId=t,this._connect()}_connect(){!p()||typeof BroadcastChannel>"u"||(this._channel=new BroadcastChannel(Dt),this._channel.addEventListener("message",t=>{const e=t.data;e.userId===this._userId&&e.type==="snapshot"&&e.snapshot&&this.emit("progress:sync",{snapshot:e.snapshot})}))}broadcast(t){var e;(e=this._channel)==null||e.postMessage({...t,userId:this._userId})}destroy(){var t;(t=this._channel)==null||t.close(),this._channel=null,this.removeAllListeners()}},w={next:"Next",prev:"Back",close:"Close",skip:"Skip tour",stepOf:"Step {current} of {total}",done:"Done",openHint:"Open hint",closeHint:"Close hint"},it=class{constructor(){this._locales=new Map([["en",w]]),this._active="en"}register(t,e){const r=this._locales.get(t)??{...w};this._locales.set(t,{...r,...e})}use(t){this._locales.has(t)||console.warn(`[GuideFlow] Locale "${t}" not registered. Falling back to "en".`),this._active=t}t(t,e){let s=(this._locales.get(this._active)??w)[t]??w[t];if(e)for(const[i,n]of Object.entries(e))s=s.replace(`{${i}}`,String(n));return s}get activeLocale(){return this._active}getLocale(t){return this._locales.get(t??this._active)??w}},Ot=new it,Ht="gf-popover-renderer",jt=`
.gf-popover {
  position: fixed;
  z-index: 999999;
  background: var(--gf-popover-bg, #fff);
  color: var(--gf-popover-text, #111);
  border-radius: var(--gf-border-radius, 10px);
  box-shadow: var(--gf-shadow, 0 8px 32px rgba(0,0,0,.16));
  border: 1px solid var(--gf-popover-border, rgba(0,0,0,.08));
  width: var(--gf-popover-width, 320px);
  max-width: calc(100vw - 32px);
  font-family: var(--gf-font-family, system-ui, sans-serif);
  font-size: var(--gf-font-size, 14px);
  line-height: var(--gf-line-height, 1.6);
  padding: var(--gf-spacing, 16px);
  box-sizing: border-box;
  animation: gf-fade-in 180ms cubic-bezier(.16,1,.3,1) both;
}
@keyframes gf-fade-in {
  from { opacity: 0; transform: scale(.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.gf-popover-header { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:10px; }
.gf-popover-title { font-weight:600; font-size:15px; margin:0; flex:1; }
.gf-popover-close { appearance:none; background:none; border:none; color:inherit; opacity:.4; cursor:pointer; padding:2px 6px; border-radius:4px; font-size:18px; line-height:1; transition:opacity 100ms; }
.gf-popover-close:hover { opacity:.9; }
.gf-popover-close:focus-visible { outline:2px solid var(--gf-accent-color,#6366f1); outline-offset:2px; opacity:.9; }
.gf-popover-body { margin:0 0 10px; opacity:.85; }
.gf-progress-bar { height:3px; background:var(--gf-progress-bg,rgba(0,0,0,.1)); border-radius:99px; margin-bottom:12px; overflow:hidden; }
.gf-progress-bar-fill { height:100%; background:var(--gf-accent-color,#6366f1); border-radius:99px; transition:width 300ms ease; }
.gf-popover-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; }
.gf-popover-step-info { font-size:12px; opacity:.5; }
.gf-popover-actions { display:flex; gap:6px; }
.gf-btn { appearance:none; display:inline-flex; align-items:center; border:none; border-radius:var(--gf-btn-radius,6px); padding:8px 18px; font-size:13px; font-family:inherit; font-weight:500; cursor:pointer; transition:opacity 120ms; line-height:1; }
.gf-btn:focus-visible { outline:2px solid var(--gf-accent-color,#6366f1); outline-offset:2px; }
.gf-btn-primary { background:var(--gf-accent-color,#6366f1); color:var(--gf-accent-fg,#fff); }
.gf-btn-primary:hover { opacity:.9; }
.gf-btn-secondary { background:transparent; color:inherit; opacity:.6; }
.gf-btn-secondary:hover { opacity:1; }
.gf-btn-ghost { background:transparent; color:inherit; opacity:.45; font-size:12px; padding:6px 10px; }
.gf-btn-ghost:hover { opacity:.8; }
`,N=class{constructor(){this._popoverEl=null,this._onAction=null,this._config=null,this._popoverId=st("gf-popover")}setActionHandler(t){this._onAction=t}onInit(t){this._config=t,t.injectStyles!==!1&&$(jt,Ht,t.nonce)}renderStep(t,e,r,s){if(!p())return;this._ensurePopover();const i=this._popoverEl;i.innerHTML=this._buildHTML(t,e,r,s),i.setAttribute("role","dialog"),i.setAttribute("aria-modal","true"),i.setAttribute("aria-labelledby",`${this._popoverId}-title`),i.setAttribute("aria-describedby",`${this._popoverId}-body`),i.removeAttribute("data-enter"),i.offsetWidth,i.setAttribute("data-enter",""),i.querySelectorAll("[data-gf-action]").forEach(a=>{a.addEventListener("click",()=>{var u;const d=a.getAttribute("data-gf-action")??"";(u=this._onAction)==null||u.call(this,d)})});const n=t.target,o=typeof n=="string"?document.querySelector(n):n instanceof Element?n:null;this._position(i,o,t.placement??"bottom");const c=i.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');c==null||c.focus()}hideStep(){var t;this._popoverEl&&((t=this._popoverEl.parentNode)==null||t.removeChild(this._popoverEl),this._popoverEl=null)}renderHotspot(t){}destroyHotspot(t){}renderHint(t){}destroyHints(){}_ensurePopover(){this._popoverEl||(this._popoverEl=document.createElement("div"),this._popoverEl.className="gf-popover",this._popoverEl.setAttribute("id",this._popoverId),document.body.appendChild(this._popoverEl))}_buildHTML(t,e,r,s){const i=Ot,n=s>1?Math.round((r+1)/s*100):100,o=r===0,c=r===s-1,a=t.actions??[...o?[]:[{label:i.t("prev"),variant:"secondary",action:"prev"}],{label:c?i.t("done"):i.t("next"),variant:"primary",action:c?"end":"next"}];return`
      ${s>1?`
        <div class="gf-progress-bar" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="100">
          <div class="gf-progress-bar-fill" style="width:${n}%"></div>
        </div>
      `:""}
      <div class="gf-popover-header">
        ${e.title?`<h2 class="gf-popover-title" id="${this._popoverId}-title">${this._esc(e.title)}</h2>`:"<span></span>"}
        <button class="gf-popover-close" data-gf-action="end" aria-label="${i.t("close")}" type="button">×</button>
      </div>
      ${e.body?`<p class="gf-popover-body" id="${this._popoverId}-body">${this._esc(e.body)}</p>`:e.html?`<div class="gf-popover-body" id="${this._popoverId}-body">${this._sanitizeHTML(e.html)}</div>`:""}
      <div class="gf-popover-footer">
        ${s>1?`<span class="gf-popover-step-info">${i.t("stepOf",{current:r+1,total:s})}</span>`:"<span></span>"}
        <div class="gf-popover-actions">
          <button class="gf-btn gf-btn-ghost" data-gf-action="skip" type="button">${i.t("skip")}</button>
          ${a.map(d=>`
            <button class="gf-btn gf-btn-${d.variant??"primary"}" data-gf-action="${d.action}" type="button">
              ${this._esc(d.label)}
            </button>
          `).join("")}
        </div>
      </div>
    `}_position(t,e,r){t.style.visibility="hidden",t.style.left="0",t.style.top="0";const s={width:t.offsetWidth,height:t.offsetHeight};if(!e){t.style.left=`${window.innerWidth/2-t.offsetWidth/2}px`,t.style.top=`${window.innerHeight/2-t.offsetHeight/2}px`,t.style.visibility="";return}const i=e.getBoundingClientRect(),n=_t(),o=ft({x:i.left,y:i.top,width:i.width,height:i.height},s,r,n);t.style.left=`${o.x}px`,t.style.top=`${o.y}px`,t.style.visibility="",t.setAttribute("data-placement",o.placement)}_esc(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}_sanitizeHTML(t){return t.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi,"").replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi,"").replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi,"").replace(/<\s*object[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi,"").replace(/<\s*embed[^>]*\/?>/gi,"").replace(/<\s*form[^>]*>[\s\S]*?<\s*\/\s*form\s*>/gi,"").replace(/<\s*base[^>]*\/?>/gi,"").replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,"").replace(/(href|src|action)\s*=\s*["']\s*(?:javascript|data)\s*:/gi,'$1="')}};function y(t={}){let e={injectStyles:!0,...t};const r=t.renderer??new N,s=new it,i=new Ft(e.persistence),n=new bt(e.nonce),o=new Et(e.nonce),c=new Map;let a=null;const d=new vt({renderer:r,...e.spotlight!==void 0&&{spotlight:e.spotlight},...e.context!==void 0&&{context:e.context},...e.debug!==void 0&&{debug:e.debug}});r instanceof N&&(r.setActionHandler(l=>{switch(l){case"next":u.next();break;case"prev":u.prev();break;case"skip":case"end":u.stop();break;default:d.send(l)}}),r.onInit(e)),d.on("tour:complete",({flowId:l})=>{var _;(_=e.context)!=null&&_.userId&&i.markCompleted(e.context.userId,l)}),n.on("hotspot:open",l=>u.emit("hotspot:open",l)),n.on("hotspot:close",l=>u.emit("hotspot:close",l)),o.on("hint:click",l=>u.emit("hint:click",l));const u=Object.assign(d,{configure(l){e={...e,...l},l.nonce},createFlow(l){return c.set(l.id,l),l},async start(l,_){var b,z;const v=typeof l=="string"?c.get(l)??null:l;if(!v){console.warn(`[GuideFlow] Flow "${String(l)}" not found.`);return}const x=(b=e.context)==null?void 0:b.userId;if(x){if(await i.isDismissed(x,v.id))return;const E=await i.loadSnapshot(x,v.id);if(E&&!E.completed){await d.start(v,_),(z=d.machine)==null||z.restore({state:E.currentState,stepIndex:E.stepIndex}),a=new Lt(x),a.on("progress:sync",({snapshot:M})=>{var P;(P=d.machine)==null||P.restore({state:M.currentState,stepIndex:M.stepIndex})});return}}await d.start(v,_)},stop(){d.end()},async next(){await d.next(),await S()},async prev(){await d.prev(),await S()},async goTo(l){await d.goTo(l),await S()},async send(l){await d.send(l),await S()},hotspot(l,_){return n.add(l,_)},removeHotspot(l){n.remove(l)},hints(l){o.register(l)},showHints(){o.show()},hideHints(){o.hide()},listFlows(){return Array.from(c.values())},destroy(){d.destroy(),n.removeAll(),o.destroy(),a==null||a.destroy(),a=null},i18n:s,progress:i,get isActive(){return d.isActive},get currentStepId(){return d.currentStepId},get currentStepIndex(){return d.currentStepIndex},get totalSteps(){return d.totalSteps},get currentStep(){return d.currentStep},get currentContent(){return d.currentContent}});async function S(){var b;const l=(b=e.context)==null?void 0:b.userId,_=d.flowId;if(!l||!_)return;const v=d.machine;if(!v)return;const x={flowId:_,currentState:v.state,stepIndex:v.stepIndex,completed:v.isFinal,timestamp:Date.now()};await i.saveSnapshot(l,x),a==null||a.broadcast({type:"snapshot",flowId:_,snapshot:x})}return u}var O=null;function W(){return O||(O=y()),O}new Proxy({},{get(t,e,r){return Reflect.get(W(),e,r)},set(t,e,r,s){return Reflect.set(W(),e,r,s)}});var nt=g.createContext(null);function F({children:t,config:e,instance:r}){const s=g.useRef(e),i=g.useMemo(()=>r||y(s.current??{}),[r]);return h.jsx(nt.Provider,{value:i,children:t})}function zt(){const t=g.useContext(nt);if(!t)throw new Error("[GuideFlow] useGuideFlow must be used inside a <TourProvider>");return t}function Mt(t){const e=zt(),[r,s]=g.useState({isActive:e.isActive,currentStepId:e.currentStepId,currentStepIndex:e.currentStepIndex,totalSteps:e.totalSteps});g.useEffect(()=>{const n=()=>{s({isActive:e.isActive,currentStepId:e.currentStepId,currentStepIndex:e.currentStepIndex,totalSteps:e.totalSteps})},c=["tour:start","tour:complete","tour:abandon","step:enter","step:exit"].map(a=>e.on(a,()=>n()));return()=>c.forEach(a=>a())},[e]);const i=g.useCallback(async(n,o)=>{const c=n??t;if(!c){console.warn("[GuideFlow] useTour: no flow provided to start()");return}await e.start(c,o)},[e,t]);return{...r,start:i,next:g.useCallback(()=>e.next(),[e]),prev:g.useCallback(()=>e.prev(),[e]),goTo:g.useCallback(n=>e.goTo(n),[e]),send:g.useCallback(n=>e.send(n),[e]),stop:g.useCallback(()=>e.stop(),[e])}}const ot=y(),D={id:"storybook-demo",initial:"step-1",states:{"step-1":{steps:[{id:"step-1",content:{title:"Welcome!",body:"This is step 1."},target:"#box-a",placement:"right"}],on:{NEXT:"step-2"}},"step-2":{steps:[{id:"step-2",content:{title:"Step 2",body:"You are doing great."},target:"#box-b",placement:"bottom"}],on:{NEXT:"step-3",PREV:"step-1"}},"step-3":{steps:[{id:"step-3",content:{title:"Done!",body:"Tour complete."},target:"#box-c",placement:"left"}],on:{},final:!0}}};function Pt(){const{isActive:t,currentStepIndex:e,totalSteps:r,next:s,prev:i,stop:n}=Mt();return t?h.jsxs("div",{style:{position:"fixed",bottom:16,right:16,background:"#6366f1",color:"#fff",padding:"8px 14px",borderRadius:8,fontSize:13},children:["Step ",e+1,"/",r,h.jsx("button",{onClick:i,style:{marginLeft:8,background:"none",border:"none",color:"#fff",cursor:"pointer"},children:"◄"}),h.jsx("button",{onClick:s,style:{marginLeft:4,background:"none",border:"none",color:"#fff",cursor:"pointer"},children:"►"}),h.jsx("button",{onClick:n,style:{marginLeft:8,background:"none",border:"none",color:"#fff",cursor:"pointer"},children:"✕"})]}):null}function L({onStart:t}){return h.jsxs("div",{style:{padding:40,display:"flex",flexDirection:"column",gap:32},children:[h.jsx("button",{onClick:t,style:{padding:"8px 20px",background:"#6366f1",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",width:"fit-content"},children:"Start Tour"}),h.jsx("div",{id:"box-a",style:{padding:24,border:"2px solid #e5e7eb",borderRadius:8},children:"Box A"}),h.jsx("div",{id:"box-b",style:{padding:24,border:"2px solid #e5e7eb",borderRadius:8},children:"Box B"}),h.jsx("div",{id:"box-c",style:{padding:24,border:"2px solid #e5e7eb",borderRadius:8},children:"Box C"}),h.jsx(Pt,{})]})}const qt={title:"Core/TourFlow",decorators:[t=>h.jsx(F,{instance:ot,children:h.jsx(t,{})})]},k={render:()=>h.jsx(L,{onStart:()=>ot.start(D)})},I={render:()=>{const t=y();return h.jsx(F,{instance:t,children:h.jsx(L,{onStart:()=>t.start(D)})})}},C={render:()=>{const t=y();return h.jsx(F,{instance:t,children:h.jsx(L,{onStart:()=>t.start(D)})})}},T={render:()=>{const t=y();return h.jsx(F,{instance:t,children:h.jsx(L,{onStart:()=>t.start(D)})})}};var q,X,Y;k.parameters={...k.parameters,docs:{...(q=k.parameters)==null?void 0:q.docs,source:{originalSource:`{
  render: () => <DemoPage onStart={() => gf.start(DEMO_FLOW)} />
}`,...(Y=(X=k.parameters)==null?void 0:X.docs)==null?void 0:Y.source}}};var V,K,U;I.parameters={...I.parameters,docs:{...(V=I.parameters)==null?void 0:V.docs,source:{originalSource:`{
  render: () => {
    const gfMinimal = createGuideFlow();
    return <TourProvider instance={gfMinimal}>
        <DemoPage onStart={() => gfMinimal.start(DEMO_FLOW)} />
      </TourProvider>;
  }
}`,...(U=(K=I.parameters)==null?void 0:K.docs)==null?void 0:U.source}}};var J,Q,Z;C.parameters={...C.parameters,docs:{...(J=C.parameters)==null?void 0:J.docs,source:{originalSource:`{
  render: () => {
    const gfBold = createGuideFlow();
    return <TourProvider instance={gfBold}>
        <DemoPage onStart={() => gfBold.start(DEMO_FLOW)} />
      </TourProvider>;
  }
}`,...(Z=(Q=C.parameters)==null?void 0:Q.docs)==null?void 0:Z.source}}};var tt,et,rt;T.parameters={...T.parameters,docs:{...(tt=T.parameters)==null?void 0:tt.docs,source:{originalSource:`{
  render: () => {
    const gfGlass = createGuideFlow();
    return <TourProvider instance={gfGlass}>
        <DemoPage onStart={() => gfGlass.start(DEMO_FLOW)} />
      </TourProvider>;
  }
}`,...(rt=(et=T.parameters)==null?void 0:et.docs)==null?void 0:rt.source}}};const Xt=["Default","ThemeMinimal","ThemeBold","ThemeGlass"];export{k as Default,C as ThemeBold,T as ThemeGlass,I as ThemeMinimal,Xt as __namedExportsOrder,qt as default};
