import type { Request,Response } from 'express';
import { webBoundary } from './web-boundary';
const boundary=webBoundary({NODE_ENV:'production',API_PUBLIC_WEB_ONLY:'true',CORS_ORIGINS:'https://iris-homepage-web.vercel.app'});
function check(path:string,method:string,headers:Record<string,string>={},remoteAddress='127.0.0.1') {
  const next=jest.fn(),json=jest.fn(),status=jest.fn().mockReturnValue({json});
  boundary({path,method,headers,socket:{remoteAddress}} as unknown as Request,{status} as unknown as Response,next);
  return{next,status};
}
describe('private bot/API and browser security boundary',()=>{
  it.each(['/api/admin/notices','/api/payments/orders','/api/unknown'])('keeps %s outside public writes',path=>expect(check(path,'POST').status).toHaveBeenCalledWith(404));
  it.each(['/api/auth/me','/api/portal/dashboard','/api/notices','/api/payments/products'])('keeps existing read %s available',path=>expect(check(path,'GET').next).toHaveBeenCalledTimes(1));
  it.each([undefined,'https://attacker.invalid','null'])('rejects cookie write from Origin %p',origin=>expect(check('/api/auth/logout','POST',origin?{origin}:{}).status).toHaveBeenCalledWith(403));
  it('accepts the exact existing homepage origin',()=>expect(check('/api/auth/logout','POST',{origin:'https://iris-homepage-web.vercel.app'}).next).toHaveBeenCalledTimes(1));
  it('allows only direct loopback internal approval; token/DTO remains enforced by controller',()=>expect(check('/internal/auth/device/approve','POST').next).toHaveBeenCalledTimes(1));
  it('refuses non-loopback and forwarded internal requests',()=>{
    expect(check('/internal/auth/device/approve','POST',{},'192.0.2.1').status).toHaveBeenCalledWith(404);
    expect(check('/internal/auth/device/approve','POST',{'x-forwarded-for':'192.0.2.1'}).status).toHaveBeenCalledWith(404);
  });
  it.each(['/INTERNAL/auth/device/approve','/Internal/Auth/Device/Approve','/internal/auth/device/approve/','/%69nternal/auth/device/approve','//internal/auth/device/approve','/api/../internal/auth/device/approve','/api/%2e%2e/internal/auth/device/approve','/unknown'])('denies unlisted path %s before case-insensitive Express routing',path=>{
    const result=check(path,'POST',{'cf-connecting-ip':'192.0.2.1'});
    expect(result.status).toHaveBeenCalledWith(404);expect(result.next).not.toHaveBeenCalled();
  });
  it('keeps health local and denies forwarding',()=>{
    expect(check('/health','GET').next).toHaveBeenCalledTimes(1);
    expect(check('/health','GET',{'x-forwarded-for':'192.0.2.1'}).status).toHaveBeenCalledWith(404);
  });
  it('does not allow preflight requests to unknown public paths',()=>{
    expect(check('/api/unknown','OPTIONS').status).toHaveBeenCalledWith(404);
    expect(check('/api/auth/me','OPTIONS').next).toHaveBeenCalledTimes(1);
  });
});
