import type { UserRole } from '../types';

export const MAIN_SUPPORT_NUMBER = '9647885663748';
export const MAIN_SUPPORT_DISPLAY = '07885663748';
export const MAIN_SUPPORT_INTL = '+964 788 566 3748';
export const MAIN_SUPPORT_URL = 'https://wa.me/9647885663748';
export const MAIN_SUPPORT_CALL_URL = 'tel:+9647885663748';

export const PATIENT_WOMEN_SUPPORT_NUMBER = '9647752564326';
export const PATIENT_WOMEN_SUPPORT_DISPLAY = '07752564326';
export const PATIENT_WOMEN_SUPPORT_INTL = '+964 775 256 4326';
export const PATIENT_WOMEN_SUPPORT_URL = 'https://wa.me/9647752564326';
export const PATIENT_WOMEN_SUPPORT_CALL_URL = 'tel:+9647752564326';

export const OFFICIAL_SUPPORT_EMAIL = 'support@medora-iq.com';
export const OFFICIAL_SUPPORT_EMAIL_HREF = `mailto:${OFFICIAL_SUPPORT_EMAIL}`;
export const OFFICIAL_INSTAGRAM_URL = 'https://www.instagram.com/medoraq/';

export const MAIN_SUPPORT_TITLE_AR = 'الدعم الرئيسي والاشتراكات';
export const MAIN_SUPPORT_BUTTON_AR = 'تواصل مع الدعم الرئيسي';

export const PATIENT_WOMEN_SUPPORT_TITLE_AR = 'دعم المرضى والمساعدة النسائية';
export const PATIENT_SUPPORT_LABEL_AR = 'دعم المرضى';
export const PATIENT_SUPPORT_BUTTON_AR = 'تواصل مع دعم المرضى';
export const WOMENS_SUPPORT_LABEL_AR = 'الدعم والمساعدة النسائية';
export const WOMENS_SUPPORT_BUTTON_AR = 'تواصلي مع الدعم النسائي';

export const DEFAULT_MAIN_SUPPORT_MESSAGE =
  'السلام عليكم، أتواصل مع الدعم الرئيسي لمنصة MEDORA. نوع الحساب أو المؤسسة: [اكتب هنا]. نوع المشكلة أو الاستفسار: [اكتب هنا]. شرح الحالة بالتفصيل: [اكتب هنا].';

export const DEFAULT_PATIENT_SUPPORT_MESSAGE =
  'السلام عليكم، أحتاج مساعدة من دعم المرضى في منصة MEDORA. نوع المشكلة: [اكتب هنا]. شرح الحالة بالتفصيل: [اكتب هنا].';

export const DEFAULT_WOMENS_SUPPORT_MESSAGE =
  'السلام عليكم، أحتاج مساعدة من قسم الدعم النسائي في منصة MEDORA. أود شرح حالتي أو استفساري بالتفصيل والحصول على المساعدة المناسبة.';

export type SupportChannelId = 'main' | 'patient' | 'womens';

export type SupportRoutingCategory =
  | 'doctor_institution'
  | 'subscription_payment'
  | 'general_admin'
  | 'patient_assistance'
  | 'womens_support';

export type SupportAccountType =
  | 'patient'
  | 'doctor'
  | 'laboratory'
  | 'pharmacy'
  | 'radiology_center'
  | 'wholesaler'
  | 'secretary'
  | 'other';

export interface SupportRequestDetails {
  name?: string;
  accountType?: SupportAccountType | string;
  accountTypeLabel?: string;
  inquiryCategory?: string;
  description?: string;
  referenceNumber?: string;
}

export interface ResolvedSupportChannel {
  channel: SupportChannelId;
  category: SupportRoutingCategory;
  phoneNumber: string;
  displayPhone: string;
  intlPhone: string;
  baseUrl: string;
  sectionTitleAr: string;
  sectionTitleEn: string;
  optionTitleAr: string;
  optionTitleEn: string;
  buttonLabelAr: string;
  buttonLabelEn: string;
}

export const ACCOUNT_TYPE_LABELS: Record<SupportAccountType, { ar: string; en: string }> = {
  patient: { ar: 'مريض / مراجع', en: 'Patient' },
  doctor: { ar: 'طبيب / عيادة', en: 'Doctor / Clinic' },
  laboratory: { ar: 'مختبر تحليلات طبية', en: 'Medical Laboratory' },
  pharmacy: { ar: 'صيدلية', en: 'Pharmacy' },
  radiology_center: { ar: 'مركز أشعة وسونار', en: 'Radiology & Ultrasound' },
  wholesaler: { ar: 'مذخر ومجهز أدوية بالجملة', en: 'Wholesale Medicine Supplier' },
  secretary: { ar: 'سكرتارية واستقبال', en: 'Secretary & Reception' },
  other: { ar: 'جهة أخرى / زائر', en: 'Other / Visitor' },
};

export const ROUTING_CATEGORY_META: Array<{
  id: SupportRoutingCategory;
  channel: SupportChannelId;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}> = [
  {
    id: 'doctor_institution',
    channel: 'main',
    labelAr: 'الأطباء والمؤسسات الطبية',
    labelEn: 'Doctors & Medical Institutions',
    descAr: 'دعم العيادات والمختبرات والصيدليات ومراكز الأشعة والمذاخر والأعطال التقنية للمؤسسات.',
    descEn: 'Clinics, labs, pharmacies, radiology centers, wholesalers, and institutional technical issues.',
  },
  {
    id: 'subscription_payment',
    channel: 'main',
    labelAr: 'الاشتراكات والاعتماد والمدفوعات',
    labelEn: 'Subscriptions, Approvals & Payments',
    descAr: 'تفعيل واعتماد الحسابات، تجديد وترقية الاشتراكات، ومشاكل الدفع المالي.',
    descEn: 'Account activation & approval, subscription renewals/upgrades, and payment issues.',
  },
  {
    id: 'general_admin',
    channel: 'main',
    labelAr: 'استفسارات المنصة والإدارة العامة',
    labelEn: 'General Platform & Admin Inquiries',
    descAr: 'الدعم العام للمنصة والتنسيق الإداري والمراسلات الرسمية.',
    descEn: 'General platform support and administrative coordination.',
  },
  {
    id: 'patient_assistance',
    channel: 'patient',
    labelAr: 'مساعدة المرضى والمراجعين',
    labelEn: 'Patient Assistance',
    descAr: 'حجز المواعيد، مشاكل حساب المريض، الوصول للسجل الطبي، ومساعدة استخدام البوابة.',
    descEn: 'Appointment bookings, patient account issues, medical record access, and portal help.',
  },
  {
    id: 'womens_support',
    channel: 'womens',
    labelAr: 'الدعم والمساعدة النسائية',
    labelEn: "Women's Support & Assistance",
    descAr: 'قسم مخصص للاستفسارات والمساعدة النسائية بخصوصية واهتمام.',
    descEn: 'Dedicated support desk for women requesting focused assistance.',
  },
];

export const INQUIRY_SUBTOPICS: Record<SupportRoutingCategory, Array<{ ar: string; en: string }>> = {
  doctor_institution: [
    { ar: 'دعم حساب طبيب / عيادة', en: 'Doctor / Clinic Support' },
    { ar: 'دعم مختبر تحليلات طبية', en: 'Laboratory Support' },
    { ar: 'دعم صيدلية أو مذخر أدوية', en: 'Pharmacy / Wholesaler Support' },
    { ar: 'دعم مركز أشعة وسونار', en: 'Radiology Center Support' },
    { ar: 'مشكلة تقنية لمؤسسة مشتركة', en: 'Institutional Technical Issue' },
  ],
  subscription_payment: [
    { ar: 'تفعيل واعتماد الحساب المهني', en: 'Account Activation & Approval' },
    { ar: 'اشتراك جديد (طبيب / مركز / صيدلية / مذخر)', en: 'New Institution Subscription' },
    { ar: 'تجديد أو ترقية الاشتراك', en: 'Subscription Renewal / Upgrade' },
    { ar: 'مشكلة في الدفع أو الفاتورة', en: 'Payment / Billing Issue' },
  ],
  general_admin: [
    { ar: 'استفسار إداري عام', en: 'General Administrative Inquiry' },
    { ar: 'دعم عام في المنصة', en: 'General Platform Support' },
    { ar: 'شراكة أو تنسيق مؤسسي', en: 'Institutional Coordination' },
  ],
  patient_assistance: [
    { ar: 'مشكلة في حجز موعد طبي', en: 'Appointment Booking Issue' },
    { ar: 'مشكلة في حساب المريض', en: 'Patient Account Issue' },
    { ar: 'مساعدة الوصول إلى السجل الطبي', en: 'Medical Record Access Assistance' },
    { ar: 'مساعدة استخدام بوابة المريض', en: 'Patient Portal Help' },
    { ar: 'استفسار عام للمرضى', en: 'General Patient Inquiry' },
  ],
  womens_support: [
    { ar: 'استفسار ومساعدة نسائية مخصصة', en: 'Dedicated Women Support Inquiry' },
    { ar: 'مساعدة حجز موعد أو متابعة رعاية نسائية', en: 'Women Care Appointment Assistance' },
    { ar: 'مساعدة خصوصية حساب المريضة', en: 'Patient Account Privacy Help' },
  ],
};

export function mapUserRoleToAccountType(role?: UserRole | string): SupportAccountType {
  switch (role) {
    case 'doctor':
    case 'laboratory':
    case 'pharmacy':
    case 'radiology_center':
    case 'wholesaler':
    case 'secretary':
    case 'patient':
      return role;
    default:
      return 'patient';
  }
}

export function mapAccountTypeToDefaultCategory(accountType: SupportAccountType | string): SupportRoutingCategory {
  switch (accountType) {
    case 'doctor':
    case 'laboratory':
    case 'pharmacy':
    case 'radiology_center':
    case 'wholesaler':
    case 'secretary':
      return 'doctor_institution';
    case 'patient':
      return 'patient_assistance';
    default:
      return 'general_admin';
  }
}

export function resolveSupportChannel(category: SupportRoutingCategory): ResolvedSupportChannel {
  if (category === 'patient_assistance') {
    return {
      channel: 'patient',
      category,
      phoneNumber: PATIENT_WOMEN_SUPPORT_NUMBER,
      displayPhone: PATIENT_WOMEN_SUPPORT_DISPLAY,
      intlPhone: PATIENT_WOMEN_SUPPORT_INTL,
      baseUrl: PATIENT_WOMEN_SUPPORT_URL,
      sectionTitleAr: PATIENT_WOMEN_SUPPORT_TITLE_AR,
      sectionTitleEn: "Patient & Women's Support",
      optionTitleAr: PATIENT_SUPPORT_LABEL_AR,
      optionTitleEn: 'Patient Support',
      buttonLabelAr: PATIENT_SUPPORT_BUTTON_AR,
      buttonLabelEn: 'Contact Patient Support',
    };
  }

  if (category === 'womens_support') {
    return {
      channel: 'womens',
      category,
      phoneNumber: PATIENT_WOMEN_SUPPORT_NUMBER,
      displayPhone: PATIENT_WOMEN_SUPPORT_DISPLAY,
      intlPhone: PATIENT_WOMEN_SUPPORT_INTL,
      baseUrl: PATIENT_WOMEN_SUPPORT_URL,
      sectionTitleAr: PATIENT_WOMEN_SUPPORT_TITLE_AR,
      sectionTitleEn: "Patient & Women's Support",
      optionTitleAr: WOMENS_SUPPORT_LABEL_AR,
      optionTitleEn: "Women's Support",
      buttonLabelAr: WOMENS_SUPPORT_BUTTON_AR,
      buttonLabelEn: "Contact Women's Support",
    };
  }

  return {
    channel: 'main',
    category,
    phoneNumber: MAIN_SUPPORT_NUMBER,
    displayPhone: MAIN_SUPPORT_DISPLAY,
    intlPhone: MAIN_SUPPORT_INTL,
    baseUrl: MAIN_SUPPORT_URL,
    sectionTitleAr: MAIN_SUPPORT_TITLE_AR,
    sectionTitleEn: 'Main Support & Subscriptions',
    optionTitleAr: MAIN_SUPPORT_TITLE_AR,
    optionTitleEn: 'Main Support & Subscriptions',
    buttonLabelAr: MAIN_SUPPORT_BUTTON_AR,
    buttonLabelEn: 'Contact Main Support',
  };
}

function cleanSingleLine(val?: string): string {
  return (val || '').replace(/[\r\n]+/g, ' ').trim();
}

function resolveAccountLabel(details?: SupportRequestDetails): string {
  if (details?.accountTypeLabel && cleanSingleLine(details.accountTypeLabel)) {
    return cleanSingleLine(details.accountTypeLabel);
  }
  if (details?.accountType && details.accountType in ACCOUNT_TYPE_LABELS) {
    return ACCOUNT_TYPE_LABELS[details.accountType as SupportAccountType].ar;
  }
  if (details?.accountType && cleanSingleLine(details.accountType)) {
    return cleanSingleLine(details.accountType);
  }
  return '';
}

export function buildMainSupportMessage(details?: SupportRequestDetails): string {
  const name = cleanSingleLine(details?.name);
  const accountLabel = resolveAccountLabel(details);
  const inquiry = cleanSingleLine(details?.inquiryCategory);
  const description = (details?.description || '').trim();
  const reference = cleanSingleLine(details?.referenceNumber);

  const hasCustomFields = Boolean(name || accountLabel || inquiry || description || reference);
  if (!hasCustomFields) {
    return DEFAULT_MAIN_SUPPORT_MESSAGE;
  }

  const lines = [
    `السلام عليكم، أتواصل مع الدعم الرئيسي لمنصة MEDORA. نوع الحساب أو المؤسسة: ${accountLabel || '[اكتب هنا]'}. نوع المشكلة أو الاستفسار: ${inquiry || '[اكتب هنا]'}. شرح الحالة بالتفصيل: ${description || '[اكتب هنا]'}.`,
  ];

  if (name) {
    lines.push(`الاسم: ${name}`);
  }
  if (reference) {
    lines.push(`رقم المرجع أو الطلب: ${reference}`);
  }

  return lines.join('\n');
}

export function buildPatientSupportMessage(details?: SupportRequestDetails): string {
  const name = cleanSingleLine(details?.name);
  const inquiry = cleanSingleLine(details?.inquiryCategory);
  const description = (details?.description || '').trim();
  const reference = cleanSingleLine(details?.referenceNumber);

  const hasCustomFields = Boolean(name || inquiry || description || reference);
  if (!hasCustomFields) {
    return DEFAULT_PATIENT_SUPPORT_MESSAGE;
  }

  const lines = [
    `السلام عليكم، أحتاج مساعدة من دعم المرضى في منصة MEDORA. نوع المشكلة: ${inquiry || '[اكتب هنا]'}. شرح الحالة بالتفصيل: ${description || '[اكتب هنا]'}.`,
  ];

  if (name) {
    lines.push(`الاسم: ${name}`);
  }
  if (reference) {
    lines.push(`رقم الحجز أو المرجع: ${reference}`);
  }

  return lines.join('\n');
}

export function buildWomensSupportMessage(details?: SupportRequestDetails): string {
  const name = cleanSingleLine(details?.name);
  const inquiry = cleanSingleLine(details?.inquiryCategory);
  const description = (details?.description || '').trim();
  const reference = cleanSingleLine(details?.referenceNumber);

  const hasCustomFields = Boolean(name || inquiry || description || reference);
  if (!hasCustomFields) {
    return DEFAULT_WOMENS_SUPPORT_MESSAGE;
  }

  const lines = [DEFAULT_WOMENS_SUPPORT_MESSAGE];
  if (name) {
    lines.push(`الاسم: ${name}`);
  }
  if (inquiry) {
    lines.push(`موضوع المساعدة: ${inquiry}`);
  }
  if (description) {
    lines.push(`التفاصيل: ${description}`);
  }
  if (reference) {
    lines.push(`رقم الحجز أو المرجع: ${reference}`);
  }

  return lines.join('\n');
}

export function buildSupportMessage(channel: SupportChannelId, details?: SupportRequestDetails): string {
  if (channel === 'patient') return buildPatientSupportMessage(details);
  if (channel === 'womens') return buildWomensSupportMessage(details);
  return buildMainSupportMessage(details);
}

export function buildWhatsAppSupportHref(channel: SupportChannelId, details?: SupportRequestDetails): string {
  const baseUrl = channel === 'main' ? MAIN_SUPPORT_URL : PATIENT_WOMEN_SUPPORT_URL;
  const message = buildSupportMessage(channel, details);
  return `${baseUrl}?text=${encodeURIComponent(message)}`;
}

export const DIRECT_MAIN_SUPPORT_WHATSAPP_HREF = buildWhatsAppSupportHref('main');
export const DIRECT_PATIENT_SUPPORT_WHATSAPP_HREF = buildWhatsAppSupportHref('patient');
export const DIRECT_WOMENS_SUPPORT_WHATSAPP_HREF = buildWhatsAppSupportHref('womens');

export interface SensitiveInputWarning {
  detected: boolean;
  reasons: Array<'password' | 'otp' | 'payment' | 'medical_record'>;
}

export function detectSensitiveSupportInput(text: string): SensitiveInputWarning {
  const normalized = (text || '').trim();
  if (!normalized) {
    return { detected: false, reasons: [] };
  }

  const reasons: SensitiveInputWarning['reasons'] = [];

  if (/(كلمة\s*(المرور|السر)|باسورد|password|passcode)/i.test(normalized)) {
    reasons.push('password');
  }
  if (/(رمز\s*التحقق|كود\s*التحقق|\botp\b|verification\s*code|pin\s*code)/i.test(normalized)) {
    reasons.push('otp');
  }
  if (/(cvv|رقم\s*البطاقة|ماستر\s*كارد|فيزا\s*كارد|card\s*number|\b\d{13,19}\b)/i.test(normalized)) {
    reasons.push('payment');
  }
  if (/(تحليل|تقرير\s*طبي|أشعة|سونار|تشخيص|نتيجة\s*فحص|cbc|hba1c|mri|ct\s*scan)/i.test(normalized)) {
    reasons.push('medical_record');
  }

  return {
    detected: reasons.length > 0,
    reasons,
  };
}

export interface SupportVisibilityContext {
  isAuthenticated?: boolean;
  userRole?: UserRole | string | null;
  gender?: string | null;
  isAdmin?: boolean;
}

export interface SupportContactChannelInfo {
  displayPhone: string;
  intlPhone: string;
  whatsappNumber: string;
  whatsappHref: string;
  callHref: string;
}

export interface VisibleSupportContacts {
  generalContact: SupportContactChannelInfo;
  showFemaleSupport: boolean;
  femaleContact: SupportContactChannelInfo | null;
  email: string;
  emailHref: string;
  instagramUrl: string;
  instagramHandle: string;
}

export function buildPhoneCallHref(localOrIntlPhone: string): string {
  const digits = String(localOrIntlPhone || '').replace(/[^\d+]/g, '');
  if (!digits) return MAIN_SUPPORT_CALL_URL;
  if (digits.startsWith('+')) return `tel:${digits}`;
  if (digits.startsWith('964')) return `tel:+${digits}`;
  if (digits.startsWith('0')) return `tel:+964${digits.slice(1)}`;
  return `tel:+964${digits}`;
}

/**
 * STRICT PRIVACY GATE:
 * Dedicated female support (07752564326) is visible ONLY to authenticated
 * female patient accounts. It must NEVER appear to unauthenticated visitors,
 * male accounts, doctors, laboratories, radiology centers, pharmacies,
 * wholesalers, secretaries, or Super Admin.
 */
export function canViewFemaleSupport(ctx?: SupportVisibilityContext | null): boolean {
  if (!ctx || ctx.isAuthenticated !== true) return false;
  if (ctx.isAdmin === true) return false;
  if (ctx.userRole !== 'patient') return false;
  return String(ctx.gender || '').trim().toLowerCase() === 'female';
}

export function getVisibleSupportContacts(
  ctx?: SupportVisibilityContext | null
): VisibleSupportContacts {
  const showFemaleSupport = canViewFemaleSupport(ctx);

  return {
    generalContact: {
      displayPhone: MAIN_SUPPORT_DISPLAY,
      intlPhone: MAIN_SUPPORT_INTL,
      whatsappNumber: MAIN_SUPPORT_NUMBER,
      whatsappHref: MAIN_SUPPORT_URL,
      callHref: MAIN_SUPPORT_CALL_URL,
    },
    showFemaleSupport,
    femaleContact: showFemaleSupport
      ? {
          displayPhone: PATIENT_WOMEN_SUPPORT_DISPLAY,
          intlPhone: PATIENT_WOMEN_SUPPORT_INTL,
          whatsappNumber: PATIENT_WOMEN_SUPPORT_NUMBER,
          whatsappHref: DIRECT_WOMENS_SUPPORT_WHATSAPP_HREF,
          callHref: PATIENT_WOMEN_SUPPORT_CALL_URL,
        }
      : null,
    email: OFFICIAL_SUPPORT_EMAIL,
    emailHref: OFFICIAL_SUPPORT_EMAIL_HREF,
    instagramUrl: OFFICIAL_INSTAGRAM_URL,
    instagramHandle: '@medoraq',
  };
}

