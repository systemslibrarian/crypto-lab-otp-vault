import { it, expect, vi } from 'vitest';
import { stretch, reachable, posterior, privKExact, vigenereExample28, shannonConditions, lemma25, PRESETS, parseWeight, uniformCiphertextFixture } from './limits.ts';
import { rational, format, add, multiply, compare } from './rational.ts';
import * as otp from './otp.ts';
import { newLimitsCiphertext } from '../ui/limitsPanel.ts';

const independentPad = (k:number,n:number):number => n===0 ? 0 : parseInt(k.toString(2).padStart(n,'0').repeat(8).slice(0,8),2);
let seed=0x21b5ce91;
const random = (n:number):number => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n; };

it('enumerated key images are injective at every key size and fifty ciphertexts',()=>{
  for(let n=0;n<=8;n++)for(let trial=0;trial<50;trial++){
    const c=random(256), expected=new Set(Array.from({length:2**n},(_,k)=>c^independentPad(k,n)));
    expect(reachable(c,n)).toEqual(expected);expect(reachable(c,n).size).toBe(2**n);
    const p=posterior(c,n);
    for(let m=0;m<256;m++)expect(p[m]).toEqual(rational(expected.has(m)?1n:0n,BigInt(expected.size)));
  }
});

it('every distinct full-byte pair has exactly one-half winning probability',()=>{
  for(let a=0;a<256;a++)for(let b=0;b<256;b++)if(a!==b)expect(privKExact(a,b,8)).toEqual({n:1n,d:2n});
},30000);

it('five hundred pairs per shorter key size match independent subspace membership',()=>{
  for(let n=0;n<8;n++){
    const pads=Array.from({length:2**n},(_,k)=>independentPad(k,n));
    for(let trial=0;trial<500;trial++){
      const a=random(256),b=(a+1+random(255))%256;
      expect(privKExact(a,b,n)).toEqual(rational(1n,pads.includes(a^b)?2n:1n));
    }
  }
});

it('Katz Lindell Example 2.8 reproduces the published three-quarters',()=>{
  // Book value supplied in the extension brief. The implementation enumerates
  // both periods and keys; this independently derived count is 2028 / 2704.
  expect(vigenereExample28()).toEqual(rational(2028n,2704n));
  expect(format(vigenereExample28())).toBe('3/4');
});

it('independent Shannon conditions agree on presets and a thousand valid random tables including exact near misses',()=>{
  PRESETS.forEach((p,i)=>{expect(shannonConditions(p.table,p.weights)).toBe([true,false,false,true][i]);expect(lemma25(p.table,p.weights)).toBe([true,false,false,true][i]);});
  for(let trial=0;trial<1000;trial++){
    const table=Array.from({length:4},()=>{
      const row=[0,1,2,3];for(let i=3;i>0;i--){const j=random(i+1);[row[i],row[j]]=[row[j],row[i]];}return row;
    });
    const weights=Array.from({length:4},()=>BigInt(random(7)));if(weights.reduce((a,b)=>a+b,0n)===0n)weights[0]=1n;
    expect(shannonConditions(table,weights)).toBe(lemma25(table,weights));
  }
  const near=[10000000000000000n,10000000000000001n,10000000000000000n,10000000000000000n];
  expect(shannonConditions(PRESETS[0].table,near)).toBe(false);
  expect(lemma25(PRESETS[0].table,near)).toBe(false);
});

it('the uniform ciphertext negative fixture still rules out exactly 240 messages',()=>{
  const f=uniformCiphertextFixture(4);
  expect(f.roundTrips).toBe(true);expect(f.uniformKeys).toBe(true);
  expect(f.histogram).toEqual(Array(256).fill(16));expect(f.candidates).toBe(16);
});

it('Act A uses the original generator and encrypt function for its real ciphertext',()=>{
  const generated=vi.spyOn(otp,'generateKey').mockReturnValueOnce(new Uint8Array([65])).mockReturnValueOnce(new Uint8Array([13]));
  const encrypted=vi.spyOn(otp,'encrypt');
  try {
    expect(newLimitsCiphertext(4)).toBe(65^0xdd);
    expect(generated.mock.calls).toEqual([[1],[1]]);
    expect(encrypted).toHaveBeenCalledExactlyOnceWith(new Uint8Array([65]),new Uint8Array([0xdd]));
  } finally {vi.restoreAllMocks();}
});

it('invalid tables weights messages and key sizes name their causes',()=>{
  const row=PRESETS[0].table.map(r=>r.slice());row[2][1]=row[2][0];
  for(const check of [shannonConditions,lemma25]){
    expect(()=>check(row,[1n,1n,1n,1n])).toThrow('ROW_NOT_INVERTIBLE: row 2');
    expect(()=>check(PRESETS[0].table,[0n,0n,0n,0n])).toThrow('ALL_WEIGHTS_ZERO');
    expect(()=>check(PRESETS[0].table,[-1n,1n,1n,1n])).toThrow('NONNEGATIVE_INTEGER');
  }
  for(const s of ['-1','1.5','1e2',''])expect(()=>parseWeight(s)).toThrow('NONNEGATIVE_INTEGER');
  expect(parseWeight('9007199254740993')).toBe(9007199254740993n);
  expect(()=>privKExact(1,1,8)).toThrow('DISTINCT');expect(()=>stretch(0,9)).toThrow('KEY_BITS');
  expect(()=>stretch(2,1)).toThrow('KEY_OUT');expect(()=>reachable(256,8)).toThrow('BYTE');
});

it('rational arithmetic reduces fractions and compares integers exactly',()=>{
  expect(add(rational(1n,3n),rational(1n,6n))).toEqual(rational(1n,2n));
  expect(multiply(rational(2n,3n),rational(3n,4n))).toEqual(rational(1n,2n));
  expect(format(rational(0n,9n))).toBe('0');expect(format(rational(-2n,-4n))).toBe('1/2');
  expect(compare(rational(9007199254740993n),rational(9007199254740992n))).toBe(1);
  expect(()=>rational(1n,0n)).toThrow('ZERO_DENOMINATOR');
});
