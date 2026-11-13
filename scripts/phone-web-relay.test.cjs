'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),p=require('node:path');
const {registeredRelayOrigin,consumeUploadBudget,publishConnection,maintainConnection,createRelayBoundary}=require('./phone-web-relay.cjs');
const key='synthetic-routing-secret-for-isolated-tests-only',origin='https://abcdef12345678.lhr.life';
const leaseUrl='https://synthetic.public.blob.vercel-storage.com/routing/phone-origin.json';
const temporary=()=>fs.mkdtempSync(p.join(os.tmpdir(),'iris-web-relay-qa-'));

test('registration reads the provider address for both supported host formats', async () => {
  const {relayOrigin} = await import('../apps/web/lib/phone-origin.ts');
  const address = 'abcdef12345678.app.lhr.life';
  const event = {
    type: 'run.localhost.tunnel.registered',
    subject: address,
    data: {address, port: 80, message: 'Ignore https://different123.lhr.life'},
  };
  const read = value => registeredRelayOrigin(JSON.stringify(value), relayOrigin);
  a.equal(read(event), 'https://' + address);
  const legacy = 'abcdef12345678.lhr.life';
  a.equal(read({...event, subject: legacy, data: {...event.data, address: legacy}}), 'https://' + legacy);
  for (const invalid of [address + '.example.com', 'abcdef12345678.other.lhr.life', address + '/internal']) {
    a.equal(read({...event, subject: invalid, data: {...event.data, address: invalid}}), null);
  }
  a.equal(read({...event, subject: legacy}), null);
  a.equal(read({...event, data: {...event.data, port: 443}}), null);
  a.equal(read({...event, type: 'run.localhost.tunnel.closed'}), null);
});

test('upload budget holds on the 1501st attempt, including after restarting the caller',()=>{
  const dir=temporary(),file=p.join(dir,'attempts.ndjson'),now=Date.now();
  for(let i=0;i<1500;i++)consumeUploadBudget(file,now);
  a.throws(()=>consumeUploadBudget(file,now),/BUDGET_EXHAUSTED/);
  a.equal(fs.readFileSync(file,'utf8').trim().split('\n').length,1500);
  consumeUploadBudget(file,now+30*24*3600000+1);
});

test('damaged, partial or future budget records block publication',()=>{
  const dir=temporary(),file=p.join(dir,'attempts.ndjson');
  for(const text of ['{"at":','{"at":"unknown"}\n',JSON.stringify({at:Date.now()+60000})]){
    fs.writeFileSync(file,text);a.throws(()=>consumeUploadBudget(file),/HISTORY_INVALID/);
  }
});

test('publisher sends only signed connection metadata with a fixed path and minimum cache age',async()=>{
  const file=p.join(temporary(),'attempts.ndjson');let written;
  const result=await publishConnection({origin,key,instanceId:'synthetic-instance-001',budgetPath:file,token:'synthetic-token',leaseUrl,signal:new AbortController().signal,
    put:async(path,body,options)=>{a.equal(path,'routing/phone-origin.json');a.equal(options.cacheControlMaxAge,60);a.equal(options.addRandomSuffix,false);a.equal(options.allowOverwrite,true);written=JSON.parse(body);a.equal(Object.keys(written).sort().join(','),'expiresAt,instanceId,issuedAt,mac,origin,version');a(!body.includes('synthetic-token'));return{url:leaseUrl};}});
  a.equal(result.mac,written.mac);a.equal(fs.readFileSync(file,'utf8').trim().split('\n').length,1);
});

test('failed upload is retained in the budget and never returns publication success',async()=>{
  const file=p.join(temporary(),'attempts.ndjson');
  await a.rejects(publishConnection({origin,key,instanceId:'synthetic-instance-001',budgetPath:file,token:'synthetic-token',leaseUrl,signal:new AbortController().signal,put:async()=>{throw Error('synthetic network outage')}}));
  a.equal(fs.readFileSync(file,'utf8').trim().split('\n').length,1);
});

test('wrong store response stops instead of accepting an unexpected routing location',async()=>{
  await a.rejects(publishConnection({origin,key,instanceId:'synthetic-instance-001',budgetPath:p.join(temporary(),'attempts.ndjson'),token:'synthetic-token',leaseUrl,signal:new AbortController().signal,put:async()=>({url:'https://wrong.invalid/value'})}),/STORE_MISMATCH/);
});

test('temporary failure retries with a delay then publishes; stop cancels the next wait',async()=>{
  const stop=new AbortController(),events=[],waits=[];let attempts=0,published=0;
  await maintainConnection({origin,signal:stop.signal,probe:async()=>{if(++attempts===1)throw Error('temporary')},publish:async()=>{published++},log:event=>events.push(event),sleep:async(ms)=>{waits.push(ms);if(published)stop.abort()}});
  a.equal(published,1);a.deepEqual(waits,[5000,3600000]);a.deepEqual(events,['web_connection_update_failed','web_connection_published']);
});

test('quota or integrity failures stay blocked and are not treated as temporary network failures',async()=>{
  for(const code of ['WEB_UPLOAD_BUDGET_EXHAUSTED','WEB_UPLOAD_HISTORY_INVALID','WEB_LEASE_STORE_MISMATCH']){
    let success=false;await a.rejects(maintainConnection({origin,signal:new AbortController().signal,probe:async()=>{},publish:async()=>{throw Error(code)},sleep:async()=>{success=true}}),new RegExp(code));a.equal(success,false);
  }
});

test('cancellation during an upload stops without reporting a confirmed update',async()=>{
  const stop=new AbortController(),events=[];
  await maintainConnection({origin,signal:stop.signal,probe:async()=>{},publish:async()=>{stop.abort();throw Error('cancelled')},log:event=>events.push(event)});
  a.deepEqual(events,[]);
});

test('phone tunnel listener denies internal, admin, encoded and off-method paths before contacting Nest',async()=>{
  let calls=0;
  const server=await createRelayBoundary({port:0,fetchImpl:async()=>{calls++;return Response.json({authenticated:false})}});
  try {
    const base='http://127.0.0.1:'+server.address().port;
    for(const target of ['/internal/auth/device/approve','/health','/api/admin/notices','/api/auth%2fdevice/start','/api/auth/me']){
      const r=await fetch(base+target,{method:'POST',body:'{}',headers:{'content-type':'application/json'}});a.equal(r.status,404);
    }
    a.equal(calls,0);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('phone tunnel listener preserves user cookies, JSON, status and explicit public boundary',async()=>{
  const server=await createRelayBoundary({port:0,fetchImpl:async(url,options)=>{
    a.equal(url,'http://127.0.0.1:39983/api/auth/device/start');a.equal(options.headers.cookie,'natebe_session=synthetic');
    a.equal(options.headers['x-forwarded-for'],'127.0.0.1');a(!options.headers['x-internal-token']);
    a.equal(options.body.toString(),'{}');return Response.json({requestId:'synthetic'},{status:201,headers:{'set-cookie':'synthetic=value; HttpOnly; Secure; SameSite=Lax'}});
  }});
  try {const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/device/start',{method:'POST',body:'{}',headers:{origin:'https://iris-homepage-web.vercel.app',cookie:'natebe_session=synthetic','x-internal-token':'must-not-forward'}});a.equal(r.status,201);a.equal((await r.json()).requestId,'synthetic');a.equal(r.headers.getSetCookie().length,1);a(r.headers.get('cache-control').includes('no-store'));}
  finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('phone tunnel network failure is a bounded error rather than empty game data',async()=>{
  const server=await createRelayBoundary({port:0,fetchImpl:async()=>{throw Error('synthetic offline')}});
  try {const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth/me');a.equal(r.status,503);a.equal((await r.json()).code,'PHONE_PORTAL_UNAVAILABLE');}
  finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('larger JSON is compressed on the wire without changing character or ranking values',async()=>{
  const expected={ranking:Array.from({length:30},(_,i)=>({uid:'P'+String(i+1).padStart(8,'0'),value:0,description:'합성 시험 설명'.repeat(10)}))};
  const server=await createRelayBoundary({port:0,fetchImpl:async()=>Response.json(expected)});
  try {const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/portal/dashboard');a.equal(r.headers.get('content-encoding'),'gzip');a.deepEqual(await r.json(),expected);}
  finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('connection proof is bound to current instance and current origin and stops when SSH is down',async()=>{
  const {verifyPhoneOriginProof,createPhoneOriginLease}=await import('../apps/web/lib/phone-origin.ts');
  let active=origin,calls=0;
  const server=await createRelayBoundary({port:0,proofKey:key,instanceId:'synthetic-instance-001',currentOrigin:()=>active,fetchImpl:async()=>{calls++;throw Error('must_not_call_Nest')}});
  const challenge='a'.repeat(64),url='http://127.0.0.1:'+server.address().port+'/api/connection-proof?challenge='+challenge;
  try {
    const first=await fetch(url);a.equal(first.status,200);verifyPhoneOriginProof(await first.json(),createPhoneOriginLease(origin,key,'synthetic-instance-001'),challenge,key);
    active='https://fedcba12345678.lhr.life';const next=await (await fetch(url)).json();a.throws(()=>verifyPhoneOriginProof(next,createPhoneOriginLease(origin,key,'synthetic-instance-001'),challenge,key));
    active='';a.equal((await fetch(url)).status,503);a.equal(calls,0);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
