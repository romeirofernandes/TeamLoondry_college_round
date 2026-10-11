/** Passwords and key choices never leave this page-local object. Shadow DOM is
 * for scan isolation, not protection from the destination website itself. */
export function passwordField(value: unknown): value is HTMLInputElement {
  if (!(value instanceof HTMLInputElement) || value.type !== 'password' || !value.isConnected || value.disabled || value.readOnly || value.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  if (window.top !== window || !(location.protocol === 'https:' || ['localhost','127.0.0.1','[::1]'].includes(location.hostname))) return false;
  const rect = value.getBoundingClientRect(), style = getComputedStyle(value);
  const modal = document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]');
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.bottom>0 && rect.right>0 && rect.top<innerHeight && rect.left<innerWidth && (!modal || modal.contains(value));
}
export class PrivateKeyboard {
  private host = document.createElement('div');
  private root = this.host.attachShadow({mode:'closed'});
  private field: HTMLInputElement | null = null;
  private binding: {url:string; form:HTMLFormElement|null; action:string; document:Document} | null = null;
  private enabled = false;
  private shift = false;
  private symbols = false;
  private buttons: HTMLButtonElement[] = [];
  private status = 'Stopping microphone…';
  active = false;
  constructor(private onResume:()=>void, private onPopup:()=>void, private onClose:()=>void) {
    this.host.dataset.handsfreeIgnore = '';
    this.host.id = 'handsfree-private-input';
    this.host.style.cssText='all:initial!important;position:fixed!important;inset:auto 12px 12px!important;z-index:2147483646!important;pointer-events:auto!important;';
    this.host.addEventListener('mousedown', e=>e.preventDefault());
  }
  open(field:HTMLInputElement):boolean {
    if (!passwordField(field)) return false;
    this.field=field; this.binding={url:location.href,form:field.form,action:field.form?.action ?? '',document:field.ownerDocument};
    this.active=true; this.shift=false;this.symbols=false; this.render();return true;
  }
  lock(){this.enabled=false;this.status="Stopping microphone…";this.render();}
  ready(value:boolean) { this.enabled=value;this.status=value?'Microphone off. Password stays masked.':'Microphone could not be stopped. Keys are locked.';this.render(); }
  show() { this.render(); }
  valid():boolean {
    const f=this.field,b=this.binding;
    return !!f && !!b && passwordField(f) && f.ownerDocument===b.document && location.href===b.url && f.form===b.form && (f.form?.action??'')===b.action;
  }
  close() { if(document.activeElement===this.field)this.field?.blur();this.active=false;this.field=null;this.binding=null;this.render();this.onClose(); }
  destroy() { this.active=false;this.enabled=false;this.field=null;this.binding=null;this.host.remove();this.buttons=[]; }
  hit(x:number,y:number):HTMLButtonElement|null {
    return this.buttons.find(b=>{const r=b.getBoundingClientRect();return !b.disabled && x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;}) ?? null;
  }
  buttonId(button:HTMLButtonElement):string {return button.dataset.privateId ?? "private-control";}
  activate(button:HTMLButtonElement) { if(this.buttons.includes(button) && !button.disabled)button.click(); }
  press(key:string) {
    if (!this.enabled || !this.active) return;
    if (!this.valid()) { this.close();return; }
    if (key==='Done'||key==='Close') {this.field!.blur();this.close();return;}
    if (key==='Symbols') {this.symbols=!this.symbols;this.render();return;}
    if (key==='Shift') {this.shift=!this.shift;this.render();return;}
    const field=this.field!;
    const start=field.selectionStart??field.value.length,end=field.selectionEnd??start;
    let value=field.value,caret=start;
    if (key==='Clear') {value='';caret=0;}
    else if(key==='Backspace') {const from=start===end?Math.max(0,start-1):start;value=value.slice(0,from)+value.slice(end);caret=from;}
    else {
      const character=key==='Space'?' ':this.shift?key.toUpperCase():key;
      if(character.length!==1)return;
      value=value.slice(0,start)+character+value.slice(end);caret=start+character.length;
      if(field.maxLength>=0 && value.length>field.maxLength)return;
    }
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);
    field.setSelectionRange(caret,caret);
    // Intentionally no data field: no key or password in event payloads.
    field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:null}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    if(!this.valid())this.close();
  }
  private render() {
    this.root.replaceChildren(); this.buttons=[];
    const style=document.createElement('style');style.textContent=`:host{color-scheme:dark}*{box-sizing:border-box}section{max-width:900px;margin:auto;padding:16px;border:2px solid #c4ef65;border-radius:18px;background:#181e14;color:#fff;font:16px system-ui;box-shadow:0 8px 40px #0009}p{margin:0 0 12px}nav{display:flex;gap:8px;flex-wrap:wrap}.keys{display:grid;grid-template-columns:repeat(10,minmax(35px,1fr));gap:6px;margin-bottom:12px}button{font:600 19px system-ui;min-height:48px;padding:10px;border:1px solid #899775;border-radius:10px;background:#303a26;color:#fff;cursor:pointer}button:hover,button:focus{outline:3px solid #c4ef65}button:disabled{opacity:.4}small{display:block;margin-top:10px;color:#cdd9bc}`;
    const panel=document.createElement('section');panel.setAttribute('aria-label','Private password entry');
    const title=document.createElement('p');title.textContent=`Private entry • ${location.hostname} — ${this.status}`;panel.append(title);
    const add=(parent:HTMLElement,label:string,run:()=>void,disabled=false)=>{
      const b=document.createElement('button');b.type='button';b.dataset.privateId=`private-${label.toLowerCase()}`;b.textContent=label;b.disabled=disabled;b.onclick=run;parent.append(b);this.buttons.push(b);
    };
    if(this.active){
      const keys=document.createElement('div');keys.className='keys';
      for(const k of (this.symbols?'!@#$%^&*()-_=+[]{};:\'",.<>/?\\|`~':'1234567890qwertyuiopasdfghjklzxcvbnm'))add(keys,this.shift?k.toUpperCase():k,()=>this.press(k),!this.enabled);
      panel.append(keys);
    }
    const nav=document.createElement('nav');
    if(this.active)for(const k of ['Shift','Symbols','Space','Backspace','Clear','Done','Close'])add(nav,k,()=>this.press(k),!this.enabled);
    else add(nav,'Private keyboard',()=>{const focused=document.activeElement;const all=Array.from(document.querySelectorAll('input[type="password"]')).filter(passwordField);if(passwordField(focused))this.open(focused);else if(all.length===1)this.open(all[0]);else this.status='Choose the password field below.';this.render();},!this.enabled);
    if(!this.active){const fields=Array.from(document.querySelectorAll('input[type="password"]')).filter(passwordField);if(fields.length>1)fields.forEach((field,i)=>add(nav,`Password ${i+1}: ${field.labels?.[0]?.textContent?.trim().slice(0,60)||field.getAttribute('aria-label')||'field'}`,()=>this.open(field),!this.enabled));}
    add(nav,'Control password popup',this.onPopup,!this.enabled);
    add(nav,'Resume voice',this.onResume,false);
    panel.append(nav);
    const note=document.createElement('small');note.textContent='Done/Close keep your entry and never submit. Leave the password field, then choose Resume voice. Camera pointing stays on.';panel.append(note);
    this.root.append(style,panel);if(!this.host.isConnected)document.documentElement.append(this.host);
  }
}
