// Mutations run only on a committed, clean source baseline. Each is built, killed,
// restored byte-for-byte, rebuilt and tested green before the next begins.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'); process.chdir(root);
const config = process.env.PLAYWRIGHT_CONFIG;
const browser = title => ['npx', ['playwright','test','e2e/claims.spec.ts','--project=chromium','--grep',title,'--workers=1','--retries=0',...(config ? ['--config',config] : [])]];
const unit = title => ['npx',['vitest','run','src/otp/limits.test.ts','-t',title]];
const build = ['npm',['run','build']];
const run = ([cmd,args]) => {
 const env={...process.env,CI:'1'};
 if(cmd==='npx'&&args[0]==='playwright')env.MUTATION_ASSETS=JSON.stringify(Object.fromEntries(readdirSync('dist/assets').filter(p=>p.endsWith('.js')).map(p=>[p,createHash('sha256').update(readFileSync(join('dist/assets',p))).digest('hex')])));
 return spawnSync(cmd,args,{cwd:root,encoding:'utf8',env});
};
const pass = (cmd,label) => { const r=run(cmd); if(r.status!==0) throw Error(`${label}\n${r.stdout}\n${r.stderr}`); return r; };
const hash = () => { const h=createHash('sha256'); const walk=d=>{for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(d,e.name); if(e.isDirectory())walk(p);else {h.update(p);h.update(readFileSync(p));}}};walk('dist');return h.digest('hex'); };
const cases = [
 ['lost key bit','src/otp/limits.ts',
  '((k >> (kappa - 1 - i % kappa)) & 1)',
  '(i % kappa === kappa - 1 ? 0 : ((k >> (kappa - 1 - i % kappa)) & 1))',
  unit('enumerated key images are injective')],
 ['both reachable counted as win','src/otp/limits.ts','if (has0 === has1) halfWins += 1;','if (has0 === has1) halfWins += 2;',unit('every distinct full-byte pair')],
 ['floating tolerance in V2','src/otp/limits.ts',
  'if (mass[m][c] !== mass[0][c]) return false;',
  'if (Math.abs(Number(mass[m][c] - mass[0][c]) / Number(weights.reduce((a,b)=>a+b,0n))) > 1e-8) return false;',
  unit('independent Shannon conditions agree')],
 ['short key painted calm','src/ui/limitsPanel.ts',
  '256-candidates.size} of 256 messages ruled out.`, kappa === 8)',
  '256-candidates.size} of 256 messages ruled out.`, true)',
  browser('limits grid and secrecy verdict')],
 ['wrong period two weight','src/otp/limits.ts','const weight = period === 1 ? 26n : 1n;','const weight = period === 1 ? 26n : 26n;',unit('Katz Lindell Example 2.8')],
 ['missing negative claim','src/ui/limitsPanel.ts',
  "export const LIMITS_NEGATIVE_CLAIM = 'Ciphertexts that look uniformly random do not make a scheme perfectly secret.';",
  "export const LIMITS_NEGATIVE_CLAIM = '';",browser('limits negative fixture')],
];
const dirty=spawnSync('git',['diff','--exit-code','--',...new Set(cases.map(x=>x[1]))],{encoding:'utf8'});
if(dirty.status!==0)throw Error('Commit the source baseline before mutation checks.');
pass(build,'baseline build');const baseline=hash();const evidence=[];
mkdirSync('mutation-logs',{recursive:true});
for(const [name,file,before,after,command] of cases){
 pass(command,`${name}: baseline test`);
 const original=readFileSync(file,'utf8');if(original.split(before).length!==2)throw Error(`${name}: expected one mutation site`);
 let mutant;
 try{
  writeFileSync(file,original.replace(before,after));
  const diff=spawnSync('git',['diff','--',file],{encoding:'utf8'}).stdout;if(!diff.trim())throw Error(`${name}: empty diff`);
  pass(build,`${name}: mutant build`); mutant=hash();if(mutant===baseline)throw Error(`${name}: bundle did not move`);
  const r=run(command);writeFileSync(`mutation-logs/${name.replaceAll(' ','-')}.log`,r.stdout+r.stderr);
  if(r.status===0 || /MUTATION_ASSET_MISMATCH/.test(r.stdout+r.stderr) || !/expect\(|AssertionError|Error: expect/.test(r.stdout+r.stderr))throw Error(`${name}: no assertion kill\n${r.stdout}\n${r.stderr}`);
  evidence.push({name,sourceDiff:diff,baseline,mutant,namedTest:command[1].includes('--grep') ? command[1][command[1].indexOf('--grep')+1] : command[1].at(-1),assertionFailure:true,retries:0,servedAssetGuard:true});
 }finally{writeFileSync(file,original);pass(build,`${name}: restore build`);if(hash()!==baseline)throw Error(`${name}: restored hash differs`);pass(command,`${name}: restored test`);}
 evidence.at(-1).restoredGreen=true;console.log(`${name}: killed; exact artifact restored; owning test green`);
}
writeFileSync('mutation-evidence.json',JSON.stringify(evidence,null,2)+'\n');
