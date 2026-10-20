import { el, statusLine } from './dom.ts';
import { panelShell } from './otpPanel.ts';
import { generateKey, encrypt, textToBytes } from '../otp/otp.ts';
import { stretch, reachable, posterior, privKExact, vigenereExample28, shannonConditions, lemma25, PRESETS, parseWeight, uniformCiphertextFixture } from '../otp/limits.ts';
import { format, rational, compare } from '../otp/rational.ts';

export const LIMITS_NEGATIVE_CLAIM = 'Ciphertexts that look uniformly random do not make a scheme perfectly secret.';
/** A real random message encrypted under a real random key, including κ = 8 OTP. */
export function newLimitsCiphertext(kappa: number): number {
  const message = generateKey(1);
  const rawKey = generateKey(1);
  const key = new Uint8Array([stretch(rawKey[0] & ((1 << kappa) - 1), kappa)]);
  return encrypt(message, key)[0];
}
const hex = (n: number): string => n.toString(16).padStart(2, '0');
function byteInput(text: string): number {
  if (/^[0-9a-f]{2}$/i.test(text)) return parseInt(text,16);
  const bytes = textToBytes(text);
  if (bytes.length !== 1) throw new Error(`ONE_BYTE_REQUIRED: ${bytes.length} bytes. Bytes, not characters.`);
  return bytes[0];
}
const notice = (id: string): HTMLElement => el('p',{id,role:'status',class:'help'});
function verdict(id: string, text: string, good: boolean): HTMLElement {
  const node = statusLine(good?'✓':'✕',text,good?'calm':'danger'); node.id=id; return node;
}
function scroller(label: string, table: HTMLElement): HTMLElement {
  return el('div',{class:'limits-scroll',tabindex:0,role:'region','aria-label':label},[table]);
}

export function limitsPanel(): HTMLElement {
  let kappa = 8, c = newLimitsCiphertext(kappa);
  const slider = el('input',{id:'limits-kappa',type:'range',min:0,max:8,step:1,value:8,'aria-valuetext':'8 key bits'});
  const keyLabel = el('output',{for:'limits-kappa',id:'limits-key-label',text:'8 key bits'});
  const retired = notice('limits-retired');
  const grid = el('table',{id:'limits-grid'});
  const summary = el('div',{id:'limits-summary'});
  const target = el('input',{id:'limits-target',class:'msg-input',type:'text',value:'A','aria-describedby':'limits-target-help'});
  const targetResult = notice('limits-target-result');
  const negative = el('div',{id:'limits-negative-fixture'});
  const m0 = el('input',{id:'limits-m0',class:'msg-input',type:'text',value:'00'});
  const m1 = el('input',{id:'limits-m1',class:'msg-input',type:'text',value:'01'});
  const game = el('div',{id:'limits-game',role:'status'});
  const compute = el('button',{id:'limits-compute',class:'btn',type:'button',text:'Compute exactly'});
  const example = el('button',{id:'limits-example',class:'btn btn--ghost',type:'button',text:'K–L Example 2.8 · Vigenère'});
  const table = el('table',{id:'limits-encryption'});
  const cells: HTMLSelectElement[][] = [], weights: HTMLInputElement[] = [];
  const checks = el('div',{id:'limits-theorem',role:'status'});
  const verify = el('button',{id:'limits-verify',class:'btn',type:'button',text:'Check both conditions'});

  function showTarget(): void {
    const bytes = textToBytes(target.value);
    if (bytes.length !== 1) {
      targetResult.textContent=`ONE_BYTE_REQUIRED: your target is ${bytes.length} bytes; it must be exactly 1 byte. Bytes, not characters.`;
      target.setAttribute('aria-invalid','true'); return;
    }
    target.removeAttribute('aria-invalid');
    const found = reachable(c,kappa).has(bytes[0]);
    targetResult.textContent=`Target ${hex(bytes[0])}: ${found?'possible — at least one key reaches it':'ruled out — no key reaches it'}. Prior 1/256; posterior ${format(posterior(c,kappa)[bytes[0]])}.`;
  }
  function renderA(): void {
    const candidates = reachable(c,kappa), probabilities = posterior(c,kappa);
    grid.replaceChildren(el('caption',{text:'One-byte messages: high hex nibble × low hex nibble. ○ possible; ✕ ruled out.'}));
    const headings=el('tr',{},[el('th',{scope:'col',text:'hex'})]);
    for(let lo=0;lo<16;lo++)headings.append(el('th',{scope:'col',text:lo.toString(16)}));
    grid.append(el('thead',{},[headings]));
    const body=el('tbody');
    for(let hi=0;hi<16;hi++) {
      const row=el('tr',{},[el('th',{scope:'row',text:hi.toString(16)})]);
      for(let lo=0;lo<16;lo++) {
        const m=hi*16+lo, possible=candidates.has(m);
        row.append(el('td',{'data-byte':m,'data-possible':String(possible),class:possible?'limits-possible':'limits-excluded','aria-label':`${hex(m)} ${possible?'possible':'ruled out'}; posterior ${format(probabilities[m])}`,text:possible?'○':'✕'}));
      }
      body.append(row);
    }
    grid.append(body);
    summary.replaceChildren(
      el('p',{id:'limits-cipher',text:`Fixed ciphertext c = ${hex(c)}; κ = ${kappa}. ${kappa===0?'No key at all: c = m.':'Repeating-key XOR: repeat the κ key bits to fill one byte.'}`,'data-cipher':c}),
      el('p',{id:'limits-count',text:`|M(c)| = ${candidates.size} of 256, counted by trying every key. Cross-check: 2^${kappa} = ${2**kappa}.`}),
      el('p',{id:'limits-posterior',text:`Uniform prior: 1/256. Posterior: 1/${candidates.size} on possible messages; 0 on ruled-out messages.`}),
      verdict('limits-secrecy',kappa===8?'Perfectly secret (Theorem 2.10), with a uniform one-use key.':`Not perfectly secret — ${256-candidates.size} of 256 messages ruled out.`, kappa === 8),
    );
    negative.replaceChildren();
    if(kappa===4) {
      const fixture=uniformCiphertextFixture(kappa);
      const outcomes=[fixture.roundTrips,fixture.uniformKeys,fixture.histogram.every(n=>n===fixture.histogram[0])];
      const labels=['Every key decrypts every message correctly (4,096 round trips).','Every key has equal weight in this enumeration (256 uses each).','Under uniform messages, every ciphertext occurs equally often (16 each).'];
      outcomes.forEach((ok,i)=>negative.append(verdict(`limits-fixture-${i}`,`${ok?'PASS':'FAIL'}: ${labels[i]}`,ok)));
      negative.append(verdict('limits-negative-verdict',`CIPHERTEXTS ${outcomes[2]?'UNIFORM':'NOT UNIFORM'} — AND ${256-fixture.candidates} OF 256 MESSAGES RULED OUT`,false),el('p',{id:'limits-negative',text:LIMITS_NEGATIVE_CLAIM}));
    }
    showTarget();
  }
  slider.addEventListener('input',()=>{
    const next=Number(slider.value); if(next===kappa)return;
    kappa=next;c=newLimitsCiphertext(kappa);
    keyLabel.textContent=`${kappa} key bits`;slider.setAttribute('aria-valuetext',`${kappa} key bits${kappa===0?' — no key at all':''}`);
    retired.textContent='Previous ciphertext and game verdict retired: key size changed. The grid below is freshly enumerated.';
    game.replaceChildren(el('p',{text:'Game verdict retired. Compute again for this key size.'})); renderA();
  });
  target.addEventListener('input',showTarget);
  for(const input of [m0,m1])input.addEventListener('input',()=>game.replaceChildren(el('p',{text:'Game verdict retired: message changed. Compute again.'})));
  compute.addEventListener('click',()=>{
    game.replaceChildren();
    try {
      const a=byteInput(m0.value),b=byteInput(m1.value),result=privKExact(a,b,kappa);
      game.append(el('p',{id:'limits-game-inputs',text:`m₀ = ${hex(a)}; m₁ = ${hex(b)}; κ = ${kappa}. Every b and every key enumerated.`}),verdict('limits-game-verdict',`Pr[PrivKᵉᵃᵛ = 1] = ${format(result)} — ${compare(result,rational(1n,2n))===0?'perfectly indistinguishable for this pair':'this pair is distinguishable'}.`,compare(result,rational(1n,2n))===0));
    } catch(error) { game.append(statusLine('✕',String((error as Error).message),'danger')); }
  });
  example.addEventListener('click',()=>{
    game.replaceChildren(el('p',{text:'Example 2.8: m₀ = aa, m₁ = ab; period 1 or 2 with probability 1/2 each. Each period-1 key has probability 1/52; each period-2 key has probability 1/1352. Output 0 iff the two ciphertext letters are equal.'}),verdict('limits-game-verdict',`Exact enumeration: Pr[PrivKᵉᵃᵛ = 1] = ${format(vigenereExample28())}. A winning adversary.`,false));
  });

  table.append(el('caption',{text:'Encryption table: each row must be a permutation of 0, 1, 2, 3.'}),el('thead',{},[el('tr',{},['Key / message','0','1','2','3','Key weight'].map(text=>el('th',{scope:'col',text})))]));
  const tbody=el('tbody');
  for(let k=0;k<4;k++) {
    const row=el('tr',{},[el('th',{scope:'row',text:String(k)})]);cells[k]=[];
    for(let m=0;m<4;m++) {
      const input=el('select',{'aria-label':`Key ${k}, message ${m}`,'data-key':k,'data-message':m},[0,1,2,3].map(c=>el('option',{value:c,text:String(c)})));
      cells[k].push(input);row.append(el('td',{},[input]));
      input.addEventListener('change',()=>checks.replaceChildren(el('p',{text:'Theorem verdicts retired: table changed. Check again.'})));
    }
    const input=el('input',{type:'text',inputmode:'numeric',maxlength:80,'aria-label':`Weight of key ${k}`,'data-weight':k});weights.push(input);row.append(el('td',{},[input]));
    input.addEventListener('input',()=>checks.replaceChildren(el('p',{text:'Theorem verdicts retired: weight changed. Check again.'})));tbody.append(row);
  }
  table.append(tbody);
  function checkTable(): void {
    checks.replaceChildren();
    try {
      const t=cells.map(row=>row.map(x=>Number(x.value))),w=weights.map(x=>parseWeight(x.value));
      const v1=shannonConditions(t,w),v2=lemma25(t,w);
      if(v1!==v2)throw new Error('THEOREM_DISAGREEMENT: internal error');
      checks.append(el('div',{class:'limits-verdicts'},[verdict('limits-v1',`V1 · Shannon conditions ${v1?'HOLD':'FAIL'}`,v1),verdict('limits-v2',`V2 · Equal ciphertext distributions ${v2?'HOLD':'FAIL'}`,v2)]),el('p',{text:`The two independent checks agree: ${v1?'perfectly secret for this table and these key weights':'not perfectly secret'}.`}));
      const total=w.reduce((a,b)=>a+b,0n);
      for(let m=0;m<4;m++) {
        const mass=[0n,0n,0n,0n];for(let k=0;k<4;k++)mass[t[k][m]]+=w[k];
        checks.append(el('p',{class:'limits-mass','data-message':m,text:`Message ${m}: Pr[C = 0, 1, 2, 3] = ${mass.map(n=>format(rational(n,total))).join(', ')}.`}));
      }
    } catch(error) {checks.append(statusLine('✕',(error as Error).message,'danger'));}
  }
  verify.addEventListener('click',checkTable);
  function preset(i: number): void {
    PRESETS[i].table.forEach((row,k)=>row.forEach((c,m)=>{cells[k][m].value=String(c);}));
    PRESETS[i].weights.forEach((w,k)=>{weights[k].value=String(w);});checkTable();
  }
  const presets=el('div',{class:'controls'},PRESETS.map((p,i)=>el('button',{type:'button',class:'btn btn--ghost','data-preset':i,text:p.name,onclick:()=>preset(i)})));
  renderA();preset(0);
  return panelShell({id:'panel-limits',tone:'neutral',icon:'⚖',title:'2b · Limits of perfect secrecy',badge:'exact enumeration',notWhat:'computational security. These tiny finite spaces let us try every key, with exact fractions and no sampling.',body:[
    el('p',{class:'lead',text:'Panel 2 showed that a one-time pad ciphertext could be any message of its length. That only works because there are as many keys as messages. Give the pad fewer keys and the ciphertext starts ruling messages out. The key-space bound |K| ≥ |M| is a theorem about every perfectly secret, correctly decryptable scheme.'}),
    el('h3',{text:'A · Shorten the key'}),
    el('label',{for:'limits-kappa',class:'field-label',text:'Key size κ (bits)'}),slider,keyLabel,retired,summary,scroller('All 256 candidate messages',grid),
    el('label',{for:'limits-target',class:'field-label',text:'Try a target character'}),target,el('p',{id:'limits-target-help',class:'help',text:'Exactly one UTF-8 byte, as in Panel 2. Possible messages are neutral; ruled-out messages carry the alarm.'}),targetResult,negative,
    el('h3',{text:'B · The indistinguishability game'}),
    el('p',{text:'The adversary tries every key. If exactly one chosen message is possible, it names that message; otherwise it guesses with probability 1/2. A broken scheme can still hide some pairs. One winning pair is enough to disprove perfect indistinguishability.'}),
    el('label',{for:'limits-m0',class:'field-label',text:'Message m₀ (character or two hex digits)'}),m0,el('label',{for:'limits-m1',class:'field-label',text:'Message m₁ (different byte)'}),m1,el('div',{class:'controls'},[compute,example]),game,
    el('p',{class:'help',text:'For repeating-key XOR, the stretched pads form a binary subspace S. The exact result is 1/2 when m₀ XOR m₁ lies in S, and 1 otherwise. This is one adversary for Exercise 2.15, not the book’s solution. The Vigenère preset is a separate two-letter experiment, independent of κ.'}),
    el('h3',{text:'C · Shannon’s theorem'}),el('p',{text:'Theorem 2.12 requires |M| = |K| = |C|; all three sizes are fixed at 4 here. V1 checks equal key weights and exactly one key per (message, ciphertext). V2 independently adds key weights to compare ciphertext distributions for every message (Lemma 2.5).'}),presets,scroller('Editable four-key encryption table',table),verify,checks,
    el('p',{class:'help'},['Sources: ',el('a',{href:'https://www.cs.umd.edu/~jkatz/imc.html',text:'Katz–Lindell, Introduction to Modern Cryptography, 3rd ed. (2021), Chapter 2'}),'; ',el('a',{href:'https://doi.org/10.1002/j.1538-7305.1949.tb00928.x',text:'Shannon (1949), §10'}),'.']),
  ]});
}
