export const businessInformation = [
  ['상호', process.env.NEXT_PUBLIC_BUSINESS_NAME],
  ['대표자', process.env.NEXT_PUBLIC_BUSINESS_REPRESENTATIVE],
  ['사업자등록번호', process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER],
  ['통신판매업 신고번호', process.env.NEXT_PUBLIC_ECOMMERCE_REGISTRATION_NUMBER],
  ['사업장 주소', process.env.NEXT_PUBLIC_BUSINESS_ADDRESS],
  ['고객문의 연락처', process.env.NEXT_PUBLIC_CUSTOMER_SUPPORT_PHONE],
  ['이메일', process.env.NEXT_PUBLIC_CUSTOMER_SUPPORT_EMAIL],
] as const;

export const paymentLegalContent = {
  supply: '결제 승인과 서버 검증이 모두 끝난 뒤 로그인 계정의 RPG 캐릭터에 즉시 지급됩니다. 장애 시 중복 지급 없이 안전하게 재처리됩니다.',
  withdrawal: '디지털 재화가 지급되기 전에는 결제 취소를 요청할 수 있습니다. 지급 후 청약철회·환불은 골드 사용 여부와 관계 법령, PG 계약 및 운영 정책을 확인한 뒤 처리됩니다.',
  refund: 'PG 연동 전에는 환불이 자동 처리되지 않습니다. 운영자는 결제 상태, 지급 여부, 골드 사용 여부, PG 취소 가능 여부와 중복 환불 여부를 모두 확인해야 합니다.',
  minor: '미성년자가 법정대리인의 동의 없이 계약을 체결한 경우, 미성년자 또는 법정대리인이 해당 계약을 취소할 수 있습니다.',
} as const;
