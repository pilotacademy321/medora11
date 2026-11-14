/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { OfficialSupportCenter } from './OfficialSupportCenter';

export const ContactSection: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section id="contact" className="py-16 md:py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[#003366] uppercase tracking-wider mb-2">
            <span className="w-2 h-2 rounded-full bg-[#c4152e]" />
            <span>{t.contact.kicker}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
            {t.contact.title}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed text-balance">
            {t.contact.subtitle}
          </p>
        </div>

        <OfficialSupportCenter variant="full" portalId="public" />
      </div>
    </section>
  );
};
