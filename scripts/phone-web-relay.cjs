'use strict';

// This process handles only the website connection. It never opens RPG data or starts a bot.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const http = require('node:http');
const {gzipSync} = require('node:zlib');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');

const MONTH = 30 * 24 * 60 * 60 * 1000;
const MAX_UPLOADS = 1500;

function consumeUploadBudget(file, now = Date.now()) {
  let rows;
  try {
    rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
      const value = JSON.parse(line);
      if (!Number.isSafeInteger(value.at) || value.at > now + 30_000) throw new Error('WEB_UPLOAD_HISTORY_INVALID');
      return value;
    }) : [];
  } catch { throw new Error('WEB_UPLOAD_HISTORY_INVALID'); }
  if (rows.filter(row => row.at > now - MONTH).length >= MAX_UPLOADS) throw new Error('WEB_UPLOAD_BUDGET_EXHAUSTED');
  const fd = fs.openSync(file, 'a', 0o600);
  try { fs.writeSync(fd, JSON.stringify({at:now}) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function wait(ms, signal) {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const end = () => { clearTimeout(timer); signal.removeEventListener('abort', end); resolve(); };
    const timer = setTimeout(end, ms); signal.addEventListener('abort', end, {once:true});
  });
}

async function publishConnection({origin, key, instanceId, budgetPath, put, token, leaseUrl, signal, now = Date.now()}) {
  const {createPhoneOriginLease} = await import(pathToFileURL(path.resolve(__dirname,'../apps/web/lib/phone-origin.ts')).href);
  const record = createPhoneOriginLease(origin, key, instanceId, now);
  consumeUploadBudget(budgetPath, now);
  const result = await put('routing/phone-origin.json', JSON.stringify(record), {
    access:'public', token, addRandomSuffix:false, allowOverwrite:true, cacheControlMaxAge:60,
    contentType:'application/json', abortSignal:signal,
  });
  if (result.url !== leaseUrl) throw new Error('WEB_LEASE_STORE_MISMATCH');
  return record;
}

async function maintainConnection({
  origin, signal, probe, publish, now = () => Date.now(), sleep = wait,
  log = () => undefined, refreshMs = 3600000,
}) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      await probe(origin, signal);
      await publish(origin, signal, now());
      failures = 0; log('web_connection_published');
      await sleep(refreshMs, signal);
    } catch (error) {
      if (signal.aborted) break;
      const code = error instanceof Error ? error.message : '';
      if (['WEB_UPLOAD_BUDGET_EXHAUSTED','WEB_UPLOAD_HISTORY_INVALID','WEB_LEASE_STORE_MISMATCH'].includes(code)) {
        log(code); throw error;
      }
      log('web_connection_update_failed');
      await sleep(Math.min(300000, 5000 * 2 ** Math.min(failures++, 6)), signal);
    }
  }
}

async function createRelayBoundary({port = 39986, upstream = 'http://127.0.0.1:39983', fetchImpl = fetch,
  proofKey, instanceId, currentOrigin = () => ''} = {}) {
  const {publicPhonePath,createPhoneOriginProof} = await import(pathToFileURL(path.resolve(__dirname,'../apps/web/lib/phone-origin.ts')).href);
  const server = http.createServer(async (request, response) => {
    const reject = (status, code) => {
      response.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'private, no-store'});
      response.end(JSON.stringify({code}));
    };
    // A separate loopback listener keeps local approval/health routes out of the tunnel,
    // even when an upstream tunnel does not attach a forwarded-client header.
    const rawPath = (request.url || '').split('?')[0];
    if (request.method === 'GET' && rawPath === '/api/connection-proof') {
      const url = new URL(request.url,'http://localhost'),challenge = url.searchParams.get('challenge');
      if (!proofKey || !/^[a-f0-9]{64}$/.test(challenge || '') || [...url.searchParams.keys()].join(',') !== 'challenge') { reject(404,'NOT_FOUND'); return; }
      const origin = currentOrigin();
      if (!origin) { reject(503,'PHONE_CONNECTION_NOT_READY'); return; }
      const record = createPhoneOriginProof(origin,instanceId,challenge,proofKey);
      response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'private, no-store'});
      response.end(JSON.stringify(record)); return;
    }
    if (!publicPhonePath(rawPath, request.method)) { reject(404, 'NOT_FOUND'); return; }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000);
    const abort = () => controller.abort(); request.once('aborted', abort);
    response.once('close', () => { if (!response.writableEnded) controller.abort(); });
    try {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 16384) { reject(413, 'REQUEST_TOO_LARGE'); return; }
        chunks.push(chunk);
      }
      const headers = {'accept':'application/json','x-forwarded-for':'127.0.0.1'};
      for (const name of ['cookie','content-type','origin']) if (request.headers[name]) headers[name] = request.headers[name];
      const body = Buffer.concat(chunks);
      const result = await fetchImpl(upstream + request.url, {
        method:request.method, headers, body:body.length ? body : undefined,
        redirect:'error', cache:'no-store', signal:controller.signal,
      });
      size = 0; const output = [];
      for await (const chunk of result.body || []) {
        size += chunk.length;
        if (size > 524288) { controller.abort(); throw new Error('WEB_RELAY_RESPONSE_TOO_LARGE'); }
        output.push(chunk);
      }
      if (result.status !== 204 && !result.headers.get('content-type')?.includes('application/json')) throw new Error('WEB_RELAY_INVALID_RESPONSE');
      const returned = {'Cache-Control':'private, no-store', Vary:'Cookie, Accept-Encoding'};
      for (const name of ['content-type','retry-after']) { const value = result.headers.get(name); if (value) returned[name] = value; }
      const cookies = result.headers.getSetCookie(); if (cookies.length) returned['set-cookie'] = cookies;
      let payload = Buffer.concat(output);
      const gzip = (request.headers['accept-encoding'] || '').split(',').some(value => {
        const [name, quality] = value.trim().split(';');
        return name === 'gzip' && (!quality || !/^\s*q=0(?:\.0*)?\s*$/.test(quality));
      });
      if (result.status !== 204 && gzip && payload.length >= 1024) {
        payload = gzipSync(payload, {level:1}); returned['Content-Encoding'] = 'gzip';
      }
      response.writeHead(result.status, returned); response.end(result.status === 204 ? undefined : payload);
    } catch {
      if (!response.headersSent && !response.destroyed) reject(503, 'PHONE_PORTAL_UNAVAILABLE');
    } finally { clearTimeout(timer); request.removeListener('aborted', abort); }
  });
  server.requestTimeout = 6000; server.headersTimeout = 7000; server.keepAliveTimeout = 1000;
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve); });
  return server;
}

async function reapRelaySSH(knownHosts) {
  const matches = [];
  for (const entry of fs.readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
    try {
      const args = fs.readFileSync('/proc/'+entry+'/cmdline','utf8').split('\0');
      const forward = args.indexOf('-R');
      if (path.basename(args[0] || '') === 'ssh' && args.includes('UserKnownHostsFile='+knownHosts)
        && forward >= 0 && ['80:127.0.0.1:39983','80:127.0.0.1:39986'].includes(args[forward+1]) && args.includes('nokey@localhost.run')) {
        matches.push(Number(entry));
      }
    } catch (error) {
      if (!['ENOENT','EACCES','ESRCH'].includes(error.code)) throw error;
    }
  }
  for (const pid of matches) {
    try { process.kill(pid,'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    for (let i=0; i<80 && fs.existsSync('/proc/'+pid); i++) {
      try { if (fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1]?.startsWith('Z')) break; }
      catch (error) { if (error.code === 'ENOENT') break; throw error; }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    try {
      if (!fs.readFileSync('/proc/'+pid+'/stat','utf8').split(') ')[1]?.startsWith('Z')) throw new Error('WEB_RELAY_ORPHAN_EXIT_REQUIRED');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function run(env = process.env) {
  if (process.platform !== 'android') throw new Error('WEB_RELAY_REQUIRES_ANDROID');
  const home = env.HOME || env.USERPROFILE;
  const state = path.resolve(env.WEB_RELAY_STATE_DIR || path.join(home, 'iris-homepage-live/state'));
  const knownHosts = path.resolve(env.WEB_RELAY_KNOWN_HOSTS || path.join(state, 'relay-known-hosts'));
  const token = env.BLOB_READ_WRITE_TOKEN || '', key = env.PHONE_ORIGIN_LEASE_SECRET || '';
  const leaseUrl = env.PHONE_ORIGIN_LEASE_URL || '';
  if (key.length < 32 || !token.startsWith('vercel_blob_rw_')
    || !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/routing\/phone-origin\.json$/.test(leaseUrl)) {
    throw new Error('WEB_RELAY_NOT_CONFIGURED');
  }
  if (!fs.existsSync(knownHosts)) throw new Error('WEB_RELAY_HOST_KEY_REQUIRED');
  fs.mkdirSync(state, {recursive:true, mode:0o700});
  if (path.dirname(knownHosts) !== state || fs.lstatSync(state).isSymbolicLink()
    || !fs.lstatSync(knownHosts).isFile() || fs.lstatSync(knownHosts).isSymbolicLink()) {
    throw new Error('WEB_RELAY_STATE_PATH_INVALID');
  }
  const lock = path.join(state,'web-relay.lock');
  if (fs.existsSync(lock)) {
    const prior = JSON.parse(fs.readFileSync(lock,'utf8'));
    if (!Number.isSafeInteger(prior.pid) || prior.pid <= 1) throw new Error('WEB_RELAY_LOCK_INVALID');
    try { process.kill(prior.pid, 0); throw new Error('WEB_RELAY_ALREADY_RUNNING'); }
    catch (error) {
      if (error.code !== 'ESRCH') throw error;
      fs.renameSync(lock, lock + '.stale-' + crypto.randomUUID());
    }
  }
  const lockFd = fs.openSync(lock, 'wx', 0o600), lockId = crypto.randomUUID();
  fs.writeSync(lockFd, JSON.stringify({pid:process.pid, id:lockId})); fs.fsyncSync(lockFd); fs.closeSync(lockFd);
  const stop = new AbortController(), log = code => console.log(JSON.stringify({event:code, at:new Date().toISOString()}));
  const shutdown = () => stop.abort();
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
  let child, boundary, activeOrigin = '';
  const instanceId = crypto.randomUUID();
  try {
    await reapRelaySSH(knownHosts);
    boundary = await createRelayBoundary({proofKey:key,instanceId,currentOrigin:()=>activeOrigin});
    const apiPackage = env.WEB_RELAY_API_PACKAGE || path.resolve(__dirname,'../apps/api/package.json');
    const {put} = createRequire(apiPackage)('@vercel/blob');
    const probe = async (origin, signal) => {
      const response = await fetch(origin + '/api/auth/me', {
        headers:{Accept:'application/json'}, redirect:'error', cache:'no-store',
        signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]),
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('WEB_RELAY_PROBE_FAILED');
      let size = 0; const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 8192) throw new Error('WEB_RELAY_PROBE_FAILED');
        chunks.push(chunk);
      }
      if (JSON.parse(Buffer.concat(chunks).toString('utf8')).authenticated !== false) throw new Error('WEB_RELAY_PROBE_FAILED');
    };
    while (!stop.signal.aborted) {
      child = cp.spawn('ssh', ['-4','-T','-o','BatchMode=yes','-o','IdentityAgent=none','-o','IdentitiesOnly=yes',
        '-o','PreferredAuthentications=none','-o','PubkeyAuthentication=no','-o','PasswordAuthentication=no',
        '-o','KbdInteractiveAuthentication=no','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15',
        '-o','ServerAliveCountMax=2','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes',
        '-o','UserKnownHostsFile='+knownHosts,'-R','80:127.0.0.1:39986','nokey@localhost.run','--','--output','json'],
        {stdio:['ignore','pipe','pipe'],windowsHide:true});
      let current = '', updates = new AbortController(), task = Promise.resolve(), buffer = '';
      const queue = data => {
        buffer = (buffer + data.toString()).slice(-65536);
        const urls = buffer.match(/https:\/\/[a-z0-9]{6,63}\.lhr\.life/g) || [];
        const origin = urls.at(-1);
        if (!origin || origin === current) return;
        current = origin; activeOrigin = origin; updates.abort(); const previous = task; updates = new AbortController();
        const signal = AbortSignal.any([stop.signal, updates.signal]);
        task = previous.then(() => maintainConnection({origin, signal, probe, log, publish: (value, signal, now) =>
          publishConnection({origin:value, key, instanceId, budgetPath:path.join(state,'upload-attempts.ndjson'),
            put, token, leaseUrl, signal:AbortSignal.any([signal,AbortSignal.timeout(8000)]), now})
        })).catch(error => { log('web_relay_publication_held'); stop.abort(); });
      };
      child.stdout.on('data', queue); child.stderr.on('data', queue);
      const terminate = () => child.kill('SIGTERM'); stop.signal.addEventListener('abort', terminate, {once:true});
      let startError;
      await new Promise(resolve => { child.once('exit', resolve); child.once('error',error=>{startError=error;resolve();}); });
      activeOrigin = ''; stop.signal.removeEventListener('abort', terminate); updates.abort(); await task;
      if (startError) throw new Error('WEB_RELAY_SSH_START_FAILED');
      if (!stop.signal.aborted) { log('web_relay_reconnecting'); await wait(5000, stop.signal); }
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    if (boundary) { boundary.closeAllConnections(); await new Promise(resolve => boundary.close(resolve)); }
    process.removeListener('SIGTERM',shutdown); process.removeListener('SIGINT',shutdown);
    if (fs.existsSync(lock) && JSON.parse(fs.readFileSync(lock,'utf8')).id === lockId) fs.unlinkSync(lock);
    log('web_relay_stopped');
  }
}

module.exports = {consumeUploadBudget, publishConnection, maintainConnection, createRelayBoundary, run};
if (require.main === module) run().catch(() => {
  console.error(JSON.stringify({event:'web_relay_start_or_recovery_required'})); process.exitCode = 1;
});
