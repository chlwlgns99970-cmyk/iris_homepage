import { IsString, IsUUID, Matches } from 'class-validator';

export class LegacyLinkDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  uid!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{6,64}$/)
  code!: string;
}

export class DeviceCredentialDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  deviceSecret!: string;
}

export class ApproveDeviceDto {
  @IsString()
  @Matches(/^[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/)
  userCode!: string;

  @IsString()
  @Matches(/^\d{8}$/)
  botUid!: string;
}
