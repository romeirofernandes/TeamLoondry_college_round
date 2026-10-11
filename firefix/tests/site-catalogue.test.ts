import {it,expect} from 'vitest';
import {catalogue,siteHomes} from '../src/sites/catalogue';
import {parseSite} from '../src/sites/language';
import type {SiteSnapshot} from '../src/sites/types';
// Catalogue examples are development cases, not held-out or recognition results.
for(const action of catalogue.filter(a=>a.priority==='P0')) {
 const phrase=action.examples[0];
 const variants=[phrase,`please ${phrase}`,`${phrase} please`,`could you ${phrase}`,`can you ${phrase}`,`would you ${phrase}`,`could you please ${phrase}`,`${phrase}.`,phrase.toUpperCase(),phrase.replaceAll(" ","  ")];
 it.each(variants)(`${action.id}: %s`,text=>{
  const snapshot:SiteSnapshot={site:action.site,url:siteHomes[action.site],documentId:'catalogue',revision:0,pageType:'/',entities:[],current:null,capabilities:[]};
  expect(parseSite(text,snapshot)?.action).toBe(action.id);
 });
}
