import assert from 'node:assert/strict';
import test from 'node:test';
import { configureBehavior, setBehaviorContext, trackBehavior, markBehaviorReady, getBehaviorAttribution, stopBehavior } from './client';
test('initial views survive async runtime setup; action events are not attached to later context', async () => {
  const commands: unknown[][] = [];
  Object.defineProperty(globalThis, 'window', { configurable:true, value: {
    location:{ pathname:'/login' },
    ym:(...args:unknown[])=>{ commands.push(args); if(args[1]==='getClientID') (args[2] as (id:string)=>void)('123456'); },
  } });
  try {
    trackBehavior('ip_login_viewed'); trackBehavior('ip_document_created');
    configureBehavior({mode:'live',counterId:112833712,allowedHosts:['production.apption.space']},'https://production.apption.space');
    setBehaviorContext(null,'/login'); markBehaviorReady();
    assert.equal(commands.filter(c=>c[2]==='ip_login_viewed').length,1);
    assert.equal(commands.filter(c=>c[2]==='ip_document_created').length,0);
    assert.deepEqual(await getBehaviorAttribution(),{clientId:'123456'});
    stopBehavior(); trackBehavior('ip_questionnaire_step_viewed',{step:1}); stopBehavior();
    setBehaviorContext('product-page','/onboarding');
    assert.equal(commands.filter(c=>c[2]==='ip_questionnaire_step_viewed').length,0);
    assert.doesNotMatch(JSON.stringify(commands),/app_user_id|setUserID|product-page/);
  } finally { stopBehavior(); Reflect.deleteProperty(globalThis,'window'); }
});
