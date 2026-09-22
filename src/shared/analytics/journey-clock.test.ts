import assert from 'node:assert/strict';
import test from 'node:test';
import { JourneyClock } from './journey-clock';
test('wall time spans refresh; active time excludes hidden/closed pages and long suspension', () => {
  let now=1000; const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,v:string)=>{values.set(key,v);},removeItem:(key:string)=>{values.delete(key);}};
  const c=new JourneyClock('journey',storage,()=>now); c.visible(true);
  now+=3000; c.visible(false); now+=12000;
  assert.deepEqual(c.metrics(),{elapsed_ms:15000,active_ms:3000,step_elapsed_ms:15000,step_active_ms:3000});
  now+=60000; const restored=new JourneyClock('journey',storage,()=>now); restored.visible(true);
  now+=2000; restored.step(); now+=1000;
  assert.deepEqual(restored.metrics(),{elapsed_ms:78000,active_ms:6000,step_elapsed_ms:1000,step_active_ms:1000});
  restored.clear(); assert.equal(values.size,0);
});
test('broken storage and corrupt/future durations cannot break product or distort timers', () => {
  const storage={getItem:()=>'{"started":9999,"active":-5}',setItem:()=>{throw Error();},removeItem:()=>{throw Error();}};
  const c=new JourneyClock('x',storage,()=>1000);
  assert.equal(c.metrics().elapsed_ms,0); assert.doesNotThrow(()=>c.clear());
});
