/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authoritative & Sole Official Contact Configuration for MEDORA IRAQ.
 * Centralizes all public contact channels so future updates require editing
 * ONLY this single module and propagate automatically across all portals and pages.
 */

export interface OfficialSupportPhoneChannel {
  id: 'general_men' | 'womens';
  displayPhone: string;
  intlPhone: string;
  intlCompact: string;
  whatsappDigits: string;
  whatsappUrl: string;
  callUrl: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  whatsappCtaAr: string;
  whatsappCtaEn: string;
  callCtaAr: string;
  callCtaEn: string;
}

export interface OfficialSupportEmailChannel {
  address: string;
  mailtoHref: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  ctaAr: string;
  ctaEn: string;
}

export interface OfficialSupportInstagramChannel {
  handle: string;
  url: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  ctaAr: string;
  ctaEn: string;
}

export const OFFICIAL_SUPPORT_CONFIG = {
  brandNameAr: 'مركز الدعم الرسمي — MEDORA العراق',
  brandNameEn: 'Official Support Center — MEDORA Iraq',
  generalSupport: {
    id: 'general_men',
    displayPhone: '07885663748',
    intlPhone: '+964 788 566 3748',
    intlCompact: '+9647885663748',
    whatsappDigits: '9647885663748',
    whatsappUrl: 'https://wa.me/9647885663748',
    callUrl: 'tel:+9647885663748',
    titleAr: 'الدعم العام (الرجال)',
    titleEn: 'General Support (Men)',
    subtitleAr: 'للاستفسارات العامة، دعم الأطباء والمؤسسات، الاشتراكات، والتنسيق الفني المباشر.',
    subtitleEn: 'For general platform assistance, clinicians, institutions, subscriptions, and technical coordination.',
    whatsappCtaAr: 'مراسلة الدعم العام عبر واتساب',
    whatsappCtaEn: 'WhatsApp General Support',
    callCtaAr: 'اتصال مباشر',
    callCtaEn: 'Direct Call',
  } satisfies OfficialSupportPhoneChannel,

  womensSupport: {
    id: 'womens',
    displayPhone: '07752564326',
    intlPhone: '+964 775 256 4326',
    intlCompact: '+9647752564326',
    whatsappDigits: '9647752564326',
    whatsappUrl: 'https://wa.me/9647752564326',
    callUrl: 'tel:+9647752564326',
    titleAr: 'الدعم النسائي',
    titleEn: "Women's Support",
    subtitleAr: 'قسم مخصص للاستفسارات والمساعدة النسائية بخصوصية واهتمام مباشر.',
    subtitleEn: 'Dedicated support desk providing respectful, private assistance for women.',
    whatsappCtaAr: 'مراسلة الدعم النسائي عبر واتساب',
    whatsappCtaEn: "WhatsApp Women's Support",
    callCtaAr: 'اتصال مباشر',
    callCtaEn: 'Direct Call',
  } satisfies OfficialSupportPhoneChannel,

  email: {
    address: 'bcgmoc@gmail.com',
    mailtoHref: 'mailto:bcgmoc@gmail.com',
    titleAr: 'البريد الإلكتروني الرسمي',
    titleEn: 'Official Support Email',
    subtitleAr: 'للمراسلات الرسمية، طلبات الاعتماد، والتنسيق الإداري والمؤسسي.',
    subtitleEn: 'For official correspondence, practitioner accreditation, and institutional inquiries.',
    ctaAr: 'إرسال رسالة بريد إلكتروني',
    ctaEn: 'Send Official Email',
  } satisfies OfficialSupportEmailChannel,

  instagram: {
    handle: '@medoraq',
    url: 'https://www.instagram.com/medoraq/',
    titleAr: 'حساب Instagram الرسمي',
    titleEn: 'Official Instagram Account',
    subtitleAr: 'تابع أحدث التحديثات والإرشادات الطبية والأخبار الرسمية لمنصة MEDORA العراق.',
    subtitleEn: 'Follow the latest MEDORA Iraq updates, medical guidance, and announcements.',
    ctaAr: 'الانتقال إلى حساب @medoraq',
    ctaEn: 'Open @medoraq on Instagram',
  } satisfies OfficialSupportInstagramChannel,
} as const;

export function buildOfficialMailtoHref(subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject && subject.trim()) {
    params.set('subject', subject.trim());
  }
  if (body && body.trim()) {
    params.set('body', body.trim());
  }
  const query = params.toString();
  return query
    ? `${OFFICIAL_SUPPORT_CONFIG.email.mailtoHref}?${query}`
    : OFFICIAL_SUPPORT_CONFIG.email.mailtoHref;
}
