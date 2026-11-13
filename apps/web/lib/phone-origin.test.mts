import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhoneOriginLease,verifyPhoneOriginLease,forwardPhoneRequest as rawForwardPhoneRequest,publicPhonePath,createPhoneOriginProof} from './phone-origin.ts';

const key = 'synthetic-routing-secret-for-isolated-tests-only';
const now = Date.parse('2026-11-10T00:00:00Z');
const env = {PHONE_ORIGIN_LEASE_ENABLED:'true',PHONE_ORIGIN_LEASE_SECRET:key,
  PHONE_ORIGIN_LEASE_URL:'https://synthetic.public.blob.vercel-storage.com/routing/phone-origin.json'};
const origin = 'https://abcdef12345678.lhr.life';
const record = () => createPhoneOriginLease(origin,key,'synthetic-instance-001',now);
const request = (path = '/api/portal/dashboard', options?: RequestInit) => new Request('https://iris-homepage-web.vercel.app'+path,options);
const forwardPhoneRequest:typeof rawForwardPhoneRequest=(request,path,options={})=>{
 const original=options.fetchImpl || fetch;
 return rawForwardPhoneRequest(request,path,{...options,fetchImpl:async(url,config)=>{
  const target=new URL(String(url));
  if(target.pathname==='/api/connection-proof') {
   assert.equal(new Headers(config?.headers).get('cookie'),null);
   return Response.json(createPhoneOriginProof(target.origin,'synthetic-instance-001',target.searchParams.get('challenge')!,key));
  }
  return original(url,config);
 }});
};


test('routing lease expires after two hours and cannot alter the host, time, signature or add fields',()=>{
  const lease=record(); assert.equal(verifyPhoneOriginLease(lease,key,now).origin,origin);
  assert.throws(()=>verifyPhoneOriginLease(lease,key,now+7200000));
  assert.throws(()=>verifyPhoneOriginLease(lease,key,now-31000));
  for(const altered of [{...lease,origin:'https://fedcba12345678.lhr.life'},{...lease,mac:'0'.repeat(64)},{...lease,extra:'not allowed'}])assert.throws(()=>verifyPhoneOriginLease(altered,key,now));
  assert.throws(()=>verifyPhoneOriginLease(lease,'different-synthetic-key-that-is-long-enough',now));
});

for(const value of ['http://abcdef12345678.lhr.life','https://localhost','https://127.0.0.1','https://admin.localhost.run','https://abcdef12345678.lhr.life:8443','https://abcdef12345678.lhr.life/internal','https://u:p@abcdef12345678.lhr.life','https://abcdef12345678.lhr.life?url=other','https://abcdef12345678.lhr.life.attacker.invalid']) {
  test('rejects unapproved routing target '+value,()=>assert.throws(()=>createPhoneOriginLease(value,key,'synthetic-instance-001',now)));
}

test('public forwarding paths preserve existing auth and read operations and deny admin or internal writes',()=>{
  for(const path of ['/api/auth/me','/api/portal/dashboard','/api/notices','/api/notices/notice_123'])assert(publicPhonePath(path,'GET'));
  for(const path of ['/api/auth/device/start','/api/auth/device/complete','/api/auth/device/poll','/api/auth/device/cancel','/api/auth/logout'])assert(publicPhonePath(path,'POST'));
  for(const path of ['/internal/auth/device/approve','/api/admin/notices','/api/payments/orders','/api%2fportal/dashboard','/api/../internal/auth/device/approve','/api/phone-proxy/auth/me'])assert(!publicPhonePath(path,'POST'));
});

test('disabled optional mode and forbidden paths perform no external request',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw Error('must not run')};
  assert.equal((await forwardPhoneRequest(request(),'/api/portal/dashboard',{env:{},fetchImpl})).status,404);
  assert.equal((await forwardPhoneRequest(request(),'/internal/auth/device/approve',{env,fetchImpl})).status,404);
  assert.equal(calls,0);
});

test('keeps UID strings, query, cookies, body and secure session cookies; never forwards internal tokens',async()=>{
  let calls=0;
  const result=await forwardPhoneRequest(request('/api/auth/device/complete',{method:'POST',headers:{cookie:'session=synthetic',origin:'https://iris-homepage-web.vercel.app','content-type':'application/json','x-bot-internal-api-token':'must-not-forward'},body:'{"requestId":"synthetic"}'}),'/api/auth/device/complete',{env,now:()=>now,fetchImpl:async(url,options)=>{
    calls++; if(calls===1)return Response.json(record());
    assert.equal(String(url),origin+'/api/auth/device/complete');assert.equal(options?.redirect,'error');
    const headers=new Headers(options?.headers);assert.equal(headers.get('cookie'),'session=synthetic');assert.equal(headers.get('x-bot-internal-api-token'),null);
    assert.equal(Buffer.from(options?.body as Uint8Array).toString(),'{"requestId":"synthetic"}');
    const response=Response.json({botUid:'P00000001',numericUid:'00000001'});
    response.headers.append('Set-Cookie','natebe_session=synthetic; Secure; HttpOnly; SameSite=Lax');
    response.headers.append('Set-Cookie','natebe_session_pending=; Max-Age=0');return response;
  }});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{botUid:'P00000001',numericUid:'00000001'});
  assert.equal(result.headers.getSetCookie().length,2);assert.equal(result.headers.get('Vary'),'Cookie');assert(result.headers.get('cache-control')?.includes('no-store'));
});

test('changed signed connection address is used on the next request without mixing private responses',async()=>{
  let pointer=origin;
  const fetchImpl:typeof fetch=async(url,options)=>String(url)===env.PHONE_ORIGIN_LEASE_URL
    ? Response.json(createPhoneOriginLease(pointer,key,'synthetic-instance-001',now))
    : Response.json({source:String(url),account:new Headers(options?.headers).get('cookie')});
  const first=await forwardPhoneRequest(request('/api/portal/dashboard?page=2',{headers:{cookie:'A'}}),'/api/portal/dashboard',{env,now:()=>now,fetchImpl});
  pointer='https://fedcba12345678.app.lhr.life';
  const second=await forwardPhoneRequest(request('/api/portal/dashboard?page=3',{headers:{cookie:'B'}}),'/api/portal/dashboard',{env,now:()=>now,fetchImpl});
  assert.deepEqual(await first.json(),{source:origin+'/api/portal/dashboard?page=2',account:'A'});
  assert.deepEqual(await second.json(),{source:pointer+'/api/portal/dashboard?page=3',account:'B'});
});

test('damaged or expired connection information blocks before contacting a backend',async()=>{
  for(const data of [{...record(),mac:'0'.repeat(64)},record()]){
    let calls=0;const response=await forwardPhoneRequest(request(),'/api/portal/dashboard',{env,now:()=>now+7200001,fetchImpl:async()=>{calls++;return Response.json(data)}});
    assert.equal(response.status,503);assert.equal(calls,1);
  }
});

test('unexpected metadata host is refused without a request',async()=>{
  let calls=0;const response=await forwardPhoneRequest(request(),'/api/portal/dashboard',{env:{...env,PHONE_ORIGIN_LEASE_URL:'http://127.0.0.1/internal'},fetchImpl:async()=>{calls++;throw Error('blocked')}});
  assert.equal(response.status,503);assert.equal(calls,0);
});

test('upstream errors retain their status and do not become empty game data',async()=>{
  let calls=0;const response=await forwardPhoneRequest(request(),'/api/portal/dashboard',{env,now:()=>now,fetchImpl:async()=>++calls===1?Response.json(record()):Response.json({code:'UNAUTHORIZED'},{status:401})});
  assert.equal(response.status,401);assert.equal((await response.json()).code,'UNAUTHORIZED');
});

test('HTML error page, network loss and excessive response become bounded explicit web errors',async()=>{
  for(const upstream of [()=>new Response('<html>relay offline</html>',{headers:{'content-type':'text/html'}}),()=>{throw Error('private synthetic diagnostic');},()=>Response.json({large:'x'.repeat(524288)})]){
    let calls=0;const response=await forwardPhoneRequest(request(),'/api/portal/dashboard',{env,now:()=>now,fetchImpl:async()=>++calls===1?Response.json(record()):upstream()});
    assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes('private synthetic'));
  }
});

test('oversized browser request is refused before calling the game API',async()=>{
  let calls=0;const response=await forwardPhoneRequest(request('/api/auth/device/start',{method:'POST',body:'x'.repeat(16385)}),'/api/auth/device/start',{env,now:()=>now,fetchImpl:async()=>{calls++;return Response.json(record())}});
  assert.equal(response.status,413);assert.equal(calls,1);
});

test('connection timeout aborts remote work and returns an explicit error',async()=>{
  let aborted=false;const started=Date.now();const response=await forwardPhoneRequest(request(),'/api/portal/dashboard',{env,timeoutMs:30,fetchImpl:async(_url,options)=>new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'))},{once:true}))});
  assert.equal(response.status,503);assert(aborted);assert(Date.now()-started<500);
});

test('unproved or reassigned tunnel never receives a browser cookie or request body',async()=>{
  for(const variant of ['wrong-key','old-instance','new-origin','replayed-nonce']) {
    let calls=0;
    const response=await rawForwardPhoneRequest(request('/api/auth/device/complete',{method:'POST',headers:{cookie:'private-session'},body:'{"private":"device-code"}'}),'/api/auth/device/complete',{
      env,now:()=>now,fetchImpl:async(url,options)=>{
        calls++;
        if(calls===1)return Response.json(record());
        assert.equal(new URL(String(url)).pathname,'/api/connection-proof');
        assert.equal(new Headers(options?.headers).get('cookie'),null);assert.equal(options?.body,undefined);
        const nonce=new URL(String(url)).searchParams.get('challenge')!;
        return Response.json(createPhoneOriginProof(
          variant==='new-origin'?'https://fedcba12345678.lhr.life':origin,
          variant==='old-instance'?'synthetic-instance-002':'synthetic-instance-001',
          variant==='replayed-nonce'?'0'.repeat(64):nonce,
          variant==='wrong-key'?'different-routing-key-for-isolated-test-only':key));
      },
    });
    assert.equal(response.status,503);assert.equal(calls,2);
  }
});

function cachedFixture() {
  let time = now, generation = 1, secret = key, invalidProof = false;
  let metadata = 0, proofs = 0, upstream = 0;
  const current = () => createPhoneOriginLease(generation === 1 ? origin : 'https://abcdef98765432.app.lhr.life', secret, 'synthetic-instance-00'+generation, now);
  const fetchImpl: typeof fetch = async (url, options) => {
    if (options?.signal?.aborted) throw new DOMException('aborted','AbortError');
    const target = new URL(String(url));
    if (target.hostname.endsWith('.blob.vercel-storage.com')) { metadata++; return Response.json(current()); }
    if (target.pathname === '/api/connection-proof') {
      proofs++;
      return Response.json(createPhoneOriginProof(target.origin, 'synthetic-instance-00'+(invalidProof ? generation+1 : generation),target.searchParams.get('challenge')!,secret));
    }
    upstream++;
    return Response.json({cookie:new Headers(options?.headers).get('cookie')});
  };
  const call = (options:RequestInit = {}) => {
    const path=options.method==='POST'?'/api/auth/device/complete':'/api/auth/me';
    return rawForwardPhoneRequest(request(path,options),path,{env:{...env,PHONE_ORIGIN_LEASE_SECRET:secret},fetchImpl,now:()=>time});
  };
  return {call,current,counts:()=>({metadata,proofs,upstream}),clock:(value:number)=>{time=value;},
    rotate:()=>{generation++;},key:(value:string)=>{secret=value;},invalid:(value:boolean)=>{invalidProof=value;}};
}

test('short lease cache still challenges every request and never shares cookie responses',async()=>{
  const f=cachedFixture();await f.call();
  const results=await Promise.all(Array.from({length:6},(_,i)=>f.call({headers:{cookie:'synthetic-session-'+i}}).then(r=>r.json())));
  assert.deepEqual(results.map(row=>row.cookie),Array.from({length:6},(_,i)=>'synthetic-session-'+i));
  assert.deepEqual(f.counts(),{metadata:1,proofs:7,upstream:7});
});

test('cached lease expires with the same signed expiry and refreshes at bounded fifteen seconds',async()=>{
  const f=cachedFixture();await f.call();f.clock(now+14999);await f.call();assert.equal(f.counts().metadata,1);
  f.clock(now+15000);await f.call();assert.equal(f.counts().metadata,2);
  const g=cachedFixture();g.clock(now+2*3600000-2);await g.call();g.clock(now+2*3600000+1);
  assert.equal((await g.call()).status,503);assert.equal(g.counts().upstream,1);
});

test('proof failure after address rotation invalidates lease before credentials and next request refreshes',async()=>{
  const f=cachedFixture();await f.call();f.rotate();
  assert.equal((await f.call({headers:{cookie:'must-not-forward'}})).status,503);
  assert.equal(f.counts().upstream,1);
  assert.equal((await f.call()).status,200);
  assert.deepEqual(f.counts(),{metadata:2,proofs:3,upstream:2});
});

test('routing key changes cannot reuse a lease verified with the old key',async()=>{
  const f=cachedFixture();await f.call();f.key('different-synthetic-routing-secret-123456789');
  assert.equal((await f.call()).status,200);assert.equal(f.counts().metadata,2);
});

test('failed fresh proof with cached metadata evicts the cache without retrying an upstream write',async()=>{
  const f=cachedFixture();await f.call();f.invalid(true);
  assert.equal((await f.call({method:'POST',body:'synthetic-private-code'})).status,503);assert.equal(f.counts().upstream,1);
  f.invalid(false);assert.equal((await f.call()).status,200);assert.equal(f.counts().metadata,2);
});

test('cancelled request with cached lease does not forward credentials or retry',async()=>{
  const f=cachedFixture();await f.call();const cancelled=new AbortController();cancelled.abort();
  assert.equal((await f.call({method:'POST',body:'private-code',signal:cancelled.signal})).status,503);
  assert.equal(f.counts().upstream,1);
});
