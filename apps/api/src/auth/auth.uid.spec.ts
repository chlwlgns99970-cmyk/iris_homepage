import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ApproveDeviceDto } from './auth.dto';
describe('web UID string compatibility',()=>{
  it.each(['00000001','P00000001'])('accepts exact UID %s without normalization',botUid=>{
    const dto=plainToInstance(ApproveDeviceDto,{userCode:'ABCD-EFGH',botUid});
    expect(validateSync(dto)).toHaveLength(0);expect(dto.botUid).toBe(botUid);
  });
  it.each(['000000001','P0000001','p00000001','P000000001','P00000001 ',1,null])('rejects malformed UID %p',botUid=>{
    expect(validateSync(plainToInstance(ApproveDeviceDto,{userCode:'ABCD-EFGH',botUid})).length).toBeGreaterThan(0);
  });
});
