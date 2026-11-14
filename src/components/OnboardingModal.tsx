import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { UserRole } from '../types';
import { isPortalSuspended, isRoleSuspended } from '../config/portalsConfig';
import { calculateAgeFromDob, hasValidPhoneNumber } from '../utils/patientSearch';
import { 
  User, 
  Stethoscope, 
  Scan, 
  FlaskConical, 
  Pill, 
  Users, 
  ShieldCheck, 
  AlertCircle,
  Building2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';

export const OnboardingModal: React.FC = () => {
  const { user, needsOnboarding, registerAsPatient, applyForProfessionalRole, signOut, loading, authError } = useAuth();
  const { language, isRTL } = useLanguage();

  const doctorSpecialties = [
    'أمراض باطنية وقلبية (Internal Medicine & Cardiology)',
    'طب عام وطب أسرة (General & Family Medicine)',
    'جراحة عامة ومناظير (General & Laparoscopic Surgery)',
    'طب الأطفال وحديثي الولادة (Pediatrics & Neonatology)',
    'جراحة العظام والكسور والعمود الفقري (Orthopedics & Spine)',
    'جراحة الجملة العصبية (Neurosurgery)',
    'أمراض النساء والتوليد والعقم (Obstetrics & Gynecology)',
    'طب وجراحة العيون (Ophthalmology)',
    'طب وجراحة الأنف والأذن والحنجرة (ENT / Otolaryngology)',
    'الأمراض الجلدية والتناسلية والتجميل (Dermatology)',
    'أمراض وجراحة الكلى والمسالك البولية (Urology & Nephrology)',
    'طب وجراحة الفم والأسنان (Dentistry & Oral Surgery)',
    'الطب النفسي وعلاج الإدمان (Psychiatry)',
    'طب الأورام والعلاج الإشعاعي (Oncology)'
  ];

  // Detect if user opened onboarding from a specific portal URL
  const getContextualPortal = (): { type: 'patient' | 'professional'; role: UserRole; portalNameAr?: string } => {
    if (typeof window === 'undefined') return { type: 'patient', role: 'doctor' };
    const path = window.location.pathname.toLowerCase();
    if (path.includes('doctor')) return { type: 'professional', role: 'doctor', portalNameAr: 'بوابة الطبيب' };
    if (path.includes('laboratory') || path.includes('lab')) return { type: 'professional', role: 'laboratory', portalNameAr: 'بوابة المختبرات الطبية' };
    if (!isPortalSuspended('radiology') && (path.includes('radiology') || path.includes('xray'))) return { type: 'professional', role: 'radiology_center', portalNameAr: 'بوابة الأشعة والسونار' };
    if (path.includes('pharmacy')) return { type: 'professional', role: 'pharmacy', portalNameAr: 'بوابة الصيدلية' };
    if (!isPortalSuspended('wholesaler') && path.includes('wholesaler')) return { type: 'professional', role: 'wholesaler', portalNameAr: 'بوابة مجهزي الأدوية بالجملة' };
    if (path.includes('secretary')) return { type: 'professional', role: 'secretary', portalNameAr: 'بوابة السكرتارية' };
    if (path.includes('patient')) return { type: 'patient', role: 'doctor', portalNameAr: 'بوابة المريض' };
    return { type: 'patient', role: 'doctor' };
  };

  const portalContext = getContextualPortal();

  // Single-Step Form Fields
  const [selectedType, setSelectedType] = useState<'patient' | 'professional'>(portalContext.type);
  const [selectedRole, setSelectedRole] = useState<UserRole>(portalContext.role);
  const [specialty, setSpecialty] = useState(doctorSpecialties[0]);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [governorate, setGovernorate] = useState('بغداد (Baghdad)');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [hasMedicalConditions, setHasMedicalConditions] = useState<'yes' | 'no' | ''>('');
  const [medicalConditionsText, setMedicalConditionsText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const computedAgeYears = useMemo(() => calculateAgeFromDob(dateOfBirth), [dateOfBirth]);

  // Reset form state whenever UID or onboarding open state changes to guarantee isolation between registrations
  useEffect(() => {
    if (!needsOnboarding || !user) return;
    const ctx = getContextualPortal();
    setSelectedType(ctx.type);
    setSelectedRole(ctx.role);
    setSpecialty(doctorSpecialties[0]);
    setDisplayName(user.displayName || '');
    setLicenseNumber('');
    setFacilityName('');
    setGovernorate('بغداد (Baghdad)');
    setPhone('');
    setGender('');
    setDateOfBirth('');
    setHasMedicalConditions('');
    setMedicalConditionsText('');
    setFormError(null);
    setIsSubmitting(false);
  }, [user?.uid, needsOnboarding]);

  if (!needsOnboarding || !user) return null;

  const governoratesList = [
    'بغداد (Baghdad)',
    'البصرة (Basra)',
    'أربيل (Erbil)',
    'النجف الأشرف (Najaf)',
    'كربلاء المقدسة (Karbala)',
    'نينوى / الموصل (Nineveh)',
    'السليمانية (Sulaymaniyah)',
    'بابل / الحلة (Babylon)',
    'الأنبار (Anbar)',
    'ديالى (Diyala)',
    'كركوك (Kirkuk)',
    'ذي قار / الناصرية (Dhi Qar)',
    'ميسان / العمارة (Maysan)',
    'المثنى / السماوة (Muthanna)',
    'القادسية / الديوانية (Qadisiyyah)',
    'واسط / الكوت (Wasit)',
    'صلاح الدين (Saladin)',
    'دهوك (Duhok)'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = displayName.trim();
    if (!cleanName) {
      setFormError(language === 'ar' ? 'يرجى إدخال الاسم الكامل' : 'Please provide full name');
      return;
    }

    if (selectedType === 'patient') {
      if (!gender) {
        setFormError(language === 'ar' ? 'يرجى تحديد الجنس' : 'Please select gender');
        return;
      }
      if (!dateOfBirth || computedAgeYears === null) {
        setFormError(language === 'ar' ? 'يرجى إدخال تاريخ ميلاد صحيح لحساب العمر تلقائياً' : 'Please enter a valid date of birth');
        return;
      }
      if (!governorate.trim()) {
        setFormError(language === 'ar' ? 'يرجى اختيار المحافظة' : 'Please select your governorate');
        return;
      }
      if (!hasValidPhoneNumber(phone)) {
        setFormError(language === 'ar' ? 'يرجى إدخال رقم هاتف صحيح' : 'Please enter a valid phone number');
        return;
      }
      if (!hasMedicalConditions) {
        setFormError(language === 'ar' ? 'يرجى تحديد وجود حالات طبية أو أمراض مزمنة حالية (نعم / لا)' : 'Please indicate whether you have existing medical conditions');
        return;
      }
    }

    if (selectedType === 'professional') {
      if (!licenseNumber.trim() || !facilityName.trim() || !phone.trim()) {
        setFormError(
          language === 'ar'
            ? 'يرجى إكمال بيانات الترخيص المهني واسم المنشأة ورقم الهاتف'
            : 'Please complete license number, facility name, and phone number'
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (selectedType === 'patient') {
        const parsedConditions =
          hasMedicalConditions === 'yes'
            ? medicalConditionsText
                .split(/[\n,،]+/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        await registerAsPatient({
          displayName: cleanName,
          phone: phone.trim(),
          gender: gender as 'male' | 'female',
          dateOfBirth,
          governorate: governorate || 'بغداد (Baghdad)',
          hasMedicalConditions: hasMedicalConditions === 'yes',
          medicalConditions: parsedConditions,
        });
      } else {
        await applyForProfessionalRole({
          role: selectedRole,
          displayName: cleanName,
          licenseNumber: licenseNumber.trim(),
          facilityName: facilityName.trim(),
          governorate: governorate || 'بغداد (Baghdad)',
          phone: phone.trim(),
        });
      }
    } catch (err: any) {
      console.error('Registration onboarding error:', err);
      setFormError(
        err?.message || 
        (language === 'ar' ? 'حدث خطأ أثناء حفظ البيانات، يرجى المحاولة ثانية' : 'Error saving registration, please retry')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-5 sm:p-8 shadow-2xl border border-slate-200 text-start">
        {/* Header */}
        <div className="text-center pb-5 border-b border-slate-100">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold mb-3 border border-emerald-200">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>{language === 'ar' ? 'منصة ميدورا MEDORA — الرعاية الصحية الرقمية في العراق' : 'MEDORA Healthcare Platform'}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {language === 'ar' ? 'تهيئة وتحديد صفة الحساب' : 'Account Setup & Role Selection'}
          </h2>
          <p className="text-xs text-slate-500 mt-1.5">
            {language === 'ar' 
              ? 'اختر نوع الحساب وأكمل بياناتك الأساسية للبدء في استخدام بوابات المنصة فوراً'
              : 'Select account category and fill your basic details to start immediately'}
          </p>
        </div>

        {/* Error notification */}
        {(formError || authError) && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-600" />
            <span className="font-medium">{formError || authError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Account Category: Patient vs Professional */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              {language === 'ar' ? 'نوع الحساب المطلوب:' : 'Account Category:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedType('patient')}
                className={`p-4 rounded-2xl border text-start transition-all cursor-pointer flex items-start gap-3 ${
                  selectedType === 'patient'
                    ? 'border-[#0284c7] bg-sky-50/60 ring-2 ring-sky-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <User size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <span>{language === 'ar' ? 'حساب مريض / مراجع' : 'Patient / Public'}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {language === 'ar' ? 'مجاني ومباشر' : 'Instant Free'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {language === 'ar'
                      ? 'للمواطنين لحجز المواعيد واستعراض نتائج التحاليل والتواصل مع الأطباء.'
                      : 'For patients booking appointments, managing records, and consulting doctors.'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedType('professional')}
                className={`p-4 rounded-2xl border text-start transition-all cursor-pointer flex items-start gap-3 ${
                  selectedType === 'professional'
                    ? 'border-[#003366] bg-slate-50 ring-2 ring-[#003366]/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-[#003366] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Stethoscope size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <span>{language === 'ar' ? 'منشأة أو كادر صحي' : 'Healthcare Professional'}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      {language === 'ar' ? 'كادر معتمد' : 'Professional'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {language === 'ar'
                      ? 'للأطباء والمختبرات والصيدليات والكوادر الطبية والإدارية.'
                      : 'For doctors, clinical labs, pharmacies, and coordinators.'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Sub-roles for Healthcare Professional */}
          {selectedType === 'professional' && (
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                {language === 'ar' ? 'اختر التخصص / القطاع الصحي:' : 'Select Healthcare Specialization:'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { role: 'doctor' as UserRole, labelAr: 'طبيب اختصاص', labelEn: 'Medical Doctor', icon: Stethoscope, color: 'text-red-600' },
                  { role: 'radiology_center' as UserRole, labelAr: 'مركز أشعة وسونار', labelEn: 'Radiology Center', icon: Scan, color: 'text-cyan-600' },
                  { role: 'laboratory' as UserRole, labelAr: 'مختبر تحاليل', labelEn: 'Clinical Laboratory', icon: FlaskConical, color: 'text-orange-600' },
                  { role: 'pharmacy' as UserRole, labelAr: 'صيدلية أهلية', labelEn: 'Pharmacy', icon: Pill, color: 'text-emerald-600' },
                  { role: 'wholesaler' as UserRole, labelAr: 'مذخر / مجهز أدوية', labelEn: 'Drug Warehouse', icon: Building2, color: 'text-teal-600' },
                  { role: 'secretary' as UserRole, labelAr: 'سكرتير / استقبال', labelEn: 'Clinic Secretary', icon: Users, color: 'text-blue-600' },
                ]
                  .filter((item) => !isRoleSuspended(item.role))
                  .map((item) => {
                  const Icon = item.icon;
                  const isChosen = selectedRole === item.role;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => setSelectedRole(item.role)}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        isChosen
                          ? 'border-[#003366] bg-slate-100 font-bold text-slate-900 shadow-xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={20} className={item.color} />
                      <span className="text-xs">{language === 'ar' ? item.labelAr : item.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Form Inputs */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'ar' ? 'الاسم الكامل أو اسم المنشأة *' : 'Full Name or Facility Name *'}
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={language === 'ar' ? 'مثال: د. أحمد علي أو علي حسن' : 'e.g. Dr. Ahmed Ali or Ali Hassan'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'ar'
                  ? selectedType === 'patient'
                    ? 'رقم الهاتف الشخصي *'
                    : 'رقم الهاتف (واتساب للتواصل) *'
                  : 'Phone Number *'}
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXXX"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
              />
            </div>

            {selectedType === 'patient' && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'ar' ? 'الجنس *' : 'Gender *'}
                    </label>
                    <select
                      required
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'male' | 'female' | '')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7] bg-white"
                    >
                      <option value="">{language === 'ar' ? 'اختر الجنس...' : 'Select Gender...'}</option>
                      <option value="male">{language === 'ar' ? 'ذكر (Male)' : 'Male'}</option>
                      <option value="female">{language === 'ar' ? 'أنثى (Female)' : 'Female'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'ar' ? 'المحافظة *' : 'Governorate *'}
                    </label>
                    <select
                      required
                      value={governorate}
                      onChange={(e) => setGovernorate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0284c7] bg-white"
                    >
                      {governoratesList.map((gov) => (
                        <option key={gov} value={gov}>
                          {gov}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'ar' ? 'تاريخ الميلاد *' : 'Date of Birth *'}
                    </label>
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().split('T')[0]}
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0284c7]"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-sky-900">
                      {language === 'ar' ? 'العمر المحسوب تلقائياً:' : 'Auto-Calculated Age:'}
                    </span>
                    <span className="font-mono font-black text-sky-700 text-sm">
                      {computedAgeYears !== null
                        ? `${computedAgeYears} ${language === 'ar' ? 'سنة' : 'yrs'}`
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold text-slate-800">
                    {language === 'ar'
                      ? 'هل تعاني حالياً من أي حالات طبية أو أمراض مزمنة؟ *'
                      : 'Do you currently have any existing medical conditions? *'}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setHasMedicalConditions('yes')}
                      className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        hasMedicalConditions === 'yes'
                          ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-400/30'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {language === 'ar' ? 'نعم، لدي حالة طبية' : 'Yes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHasMedicalConditions('no');
                        setMedicalConditionsText('');
                      }}
                      className={`py-2.5 px-4 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        hasMedicalConditions === 'no'
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-400/30'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {language === 'ar' ? 'لا توجد حالات حالياً' : 'No'}
                    </button>
                  </div>

                  {hasMedicalConditions === 'yes' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        {language === 'ar'
                          ? 'تفاصيل الحالات الطبية أو الأمراض (اختياري — مفصولة بفاصلة أو سطر)'
                          : 'Optional medical condition details (comma or line separated)'}
                      </label>
                      <textarea
                        rows={2}
                        value={medicalConditionsText}
                        onChange={(e) => setMedicalConditionsText(e.target.value)}
                        placeholder={language === 'ar' ? 'مثال: سكري، ضغط الدم، ربو، تحسس البنسلين...' : 'e.g. Diabetes, Hypertension, Asthma...'}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0284c7] bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedType === 'professional' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'ar' ? 'رقم ترخيص النقابة / الإجازة *' : 'Syndicate / Practice License *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="IQ-MED-XXXXX"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'ar' ? 'اسم العيادة / المركز / الصيدلية *' : 'Facility / Practice Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={facilityName}
                      onChange={(e) => setFacilityName(e.target.value)}
                      placeholder={language === 'ar' ? 'عيادة بغداد التخصصية' : 'Baghdad Specialty Clinic'}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    />
                  </div>
                </div>

                {selectedRole === 'doctor' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'ar' ? 'التخصص الطبي الدقيق *' : 'Medical Specialty *'}
                    </label>
                    <select
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#003366] bg-white font-medium"
                    >
                      {doctorSpecialties.map((spec) => (
                        <option key={spec} value={spec}>
                          {spec}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'ar' ? 'المحافظة *' : 'Governorate *'}
                  </label>
                  <select
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#003366] bg-white"
                  >
                    {governoratesList.map((gov) => (
                      <option key={gov} value={gov}>
                        {gov}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={signOut}
              disabled={isSubmitting || loading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>

            <button
              type="submit"
              disabled={isSubmitting || loading || !displayName.trim()}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] shadow-md hover:shadow-lg disabled:opacity-40 transition-all cursor-pointer"
            >
              <CheckCircle2 size={16} />
              <span>
                {isSubmitting || loading
                  ? (language === 'ar' ? 'جاري تفعيل الحساب...' : 'Activating Account...')
                  : (language === 'ar' ? 'إكمال التسجيل والدخول' : 'Complete Registration')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
