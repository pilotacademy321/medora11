import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { PortalId } from '../types';
import { 
  subscribeToLiveMetrics, 
  fetchRealDatabaseActivities, 
  PlatformMetrics, 
  RealActivityItem 
} from '../lib/platformMetrics';
import { 
  Calendar, 
  MessageCircle, 
  ArrowLeft, 
  ArrowRight, 
  Clock, 
  BarChart3, 
  Users, 
  FileText, 
  FlaskConical, 
  TrendingUp, 
  ShieldCheck, 
  Zap, 
  Share2, 
  CheckCircle2, 
  User, 
  Stethoscope, 
  Pill, 
  Scan, 
  Truck, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Inbox
} from 'lucide-react';

interface HomePageViewProps {
  onNavigate: (route: string) => void;
  onSelectPortal: (portalId: PortalId) => void;
}

// Organic count-up animation that smoothly climbs from 0 to the target number
function useCountUp(target: number, duration: number = 1800, startDelay: number = 100): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }

    let startTimestamp: number | null = null;
    let animFrame: number;

    const timeout = setTimeout(() => {
      const step = (timestamp: number) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Exponential ease out for smooth acceleration and gentle landing
        const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        setValue(Math.floor(easeOut * target));

        if (progress < 1) {
          animFrame = requestAnimationFrame(step);
        } else {
          setValue(target);
        }
      };

      animFrame = requestAnimationFrame(step);
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(animFrame);
    };
  }, [target, duration, startDelay]);

  return value;
}

export const HomePageView: React.FC<HomePageViewProps> = ({
  onNavigate,
  onSelectPortal,
}) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();

  // Purely authentic metrics: initialized strictly at ZERO (0) - No fake numbers
  const [realMetrics, setRealMetrics] = useState<PlatformMetrics>({
    appointmentsToday: 0,
    activeUsers: 0,
    diagnosticTests: 0,
    prescriptions: 0,
  });

  // Purely authentic activities: initialized as empty list - No fake activities
  const [activities, setActivities] = useState<RealActivityItem[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);

  // Animated ascending numbers (counts up from 0 to authentic count)
  const animatedAppointments = useCountUp(realMetrics.appointmentsToday, 1600, 100);
  const animatedUsers = useCountUp(realMetrics.activeUsers, 1800, 150);
  const animatedTests = useCountUp(realMetrics.diagnosticTests, 1600, 200);
  const animatedPrescriptions = useCountUp(realMetrics.prescriptions, 1800, 250);

  // Subscribe to live Firestore metrics
  useEffect(() => {
    const unsubscribe = subscribeToLiveMetrics((updatedMetrics) => {
      setRealMetrics(updatedMetrics);
    });

    return () => unsubscribe();
  }, []);

  // Fetch real activities on mount and whenever user authentication changes
  useEffect(() => {
    let isMounted = true;
    const loadActivities = async () => {
      setIsLoadingActivities(true);
      try {
        const liveItems = await fetchRealDatabaseActivities();
        if (isMounted) {
          setActivities(liveItems);
        }
      } catch (err) {
        console.warn('Real activities fetch skipped:', err);
      } finally {
        if (isMounted) {
          setIsLoadingActivities(false);
        }
      }
    };

    loadActivities();
    return () => { isMounted = false; };
  }, [user]);

  // The 8 Portal Cards in exact requested order:
  // 1. Medical Laboratories — بوابة المختبرات الطبية
  // 2. Pharmacy — بوابة الصيدلية
  // 3. Doctor — بوابة الطبيب
  // 4. Patient — بوابة المريض
  // 5. Super Administration — بوابة الإدارة العليا
  // 6. Secretary — بوابة السكرتارية
  // 7. Wholesale Medicine Suppliers — بوابة مجهزي الأدوية بالجملة
  // 8. Radiology and Ultrasound — بوابة الأشعة والسونار
  const portalCards: Array<{
    id: PortalId;
    titleAr: string;
    titleEn: string;
    subtitleAr: string;
    subtitleEn: string;
    descAr: string;
    descEn: string;
    accentColor: string;
    cardBg: string;
    borderColor: string;
    badgeBg: string;
    btnClass: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'laboratory',
      titleAr: 'بوابة المختبرات الطبية',
      titleEn: 'Medical Laboratories',
      subtitleAr: 'الفحوصات والتحاليل وإصدار النتائج',
      subtitleEn: 'Clinical pathology & certified tests',
      descAr: 'إدارة متقدمة للتحاليل المخبرية السريرية، ربط الأجهزة الآلية، وتوفير نتائج الفحوصات بباركود موحد موثوق للطبيب والمريض.',
      descEn: 'Clinical pathology, automated analyzer tracking, and rapid certified test reports.',
      accentColor: '#e11d48',
      cardBg: 'bg-white/95 hover:bg-rose-50/40',
      borderColor: 'border-slate-200/90 hover:border-rose-400',
      badgeBg: 'bg-gradient-to-tr from-[#e11d48] to-[#f43f5e]',
      btnClass: 'bg-[#e11d48] hover:bg-[#be123c] text-white',
      icon: <FlaskConical size={22} className="text-white" />,
    },
    {
      id: 'pharmacy',
      titleAr: 'بوابة الصيدلية',
      titleEn: 'Pharmacy',
      subtitleAr: 'صرف الوصفات وإدارة المخزون',
      subtitleEn: 'Prescriptions & inventory',
      descAr: 'صرف الروشتات الإلكترونية المعتمدة، متابعة توفر الأدوية في الصيدليات، وفحص التداخلات الدوائية لحماية المريض.',
      descEn: 'e-Prescription dispensing, inventory tracking, and drug-drug interaction safety screening.',
      accentColor: '#059669',
      cardBg: 'bg-white/95 hover:bg-emerald-50/40',
      borderColor: 'border-slate-200/90 hover:border-emerald-400',
      badgeBg: 'bg-gradient-to-tr from-[#059669] to-[#10b981]',
      btnClass: 'bg-[#059669] hover:bg-[#047857] text-white',
      icon: <Pill size={22} className="text-white" />,
    },
    {
      id: 'doctor',
      titleAr: 'بوابة الطبيب',
      titleEn: 'Doctor',
      subtitleAr: 'متابعة المرضى والعيادة والحجوزات',
      subtitleEn: 'Patient follow-up & slots',
      descAr: 'منظومة متكاملة للأطباء لإدارة العيادة اليومية، جدول الاستشارات، مراجعة السجلات الطبية وإصدار الروشتات الرقمية.',
      descEn: 'Consultation scheduling, unified patient clinical charts, and digital prescriptions.',
      accentColor: '#1d4ed8',
      cardBg: 'bg-white/95 hover:bg-blue-50/40',
      borderColor: 'border-slate-200/90 hover:border-blue-400',
      badgeBg: 'bg-gradient-to-tr from-[#1d4ed8] to-[#3b82f6]',
      btnClass: 'bg-[#1d4ed8] hover:bg-[#1e40af] text-white',
      icon: <Stethoscope size={22} className="text-white" />,
    },
    {
      id: 'patient',
      titleAr: 'بوابة المريض',
      titleEn: 'Patient',
      subtitleAr: 'حجوزاتك وملفك وتقاريرك الطبية',
      subtitleEn: 'Bookings, records & tests',
      descAr: 'الملف الصحي الرقمي الموحد للمواطن، حجز مواعيد الأطباء، استعراض نتائج التحاليل وتقارير الأشعة والبحث عن الأدوية.',
      descEn: 'Personal health companion: book doctor visits, view lab and radiology results, and locate drugs.',
      accentColor: '#0097a7',
      cardBg: 'bg-white/95 hover:bg-cyan-50/40',
      borderColor: 'border-slate-200/90 hover:border-cyan-400',
      badgeBg: 'bg-gradient-to-tr from-[#00838f] to-[#00acc1]',
      btnClass: 'bg-[#00838f] hover:bg-[#006064] text-white',
      icon: <User size={22} className="text-white" />,
    },
    {
      id: 'super_admin',
      titleAr: 'بوابة الإدارة العليا',
      titleEn: 'Super Administration',
      subtitleAr: 'الرقابة المركزية والتدقيق والاعتماد',
      subtitleEn: 'Central licensing & audit',
      descAr: 'مركز القيادة والرقابة التنظيمية للمنصة، تدقيق تراخيص الكوادر الطبية والمراكز الصحية، وإدارة مستويات الصلاحيات والأمان.',
      descEn: 'Central executive governance hub: provider credential verification, licensing tiers, and security audits.',
      accentColor: '#0f766e',
      cardBg: 'bg-white/95 hover:bg-teal-50/40',
      borderColor: 'border-slate-200/90 hover:border-teal-400',
      badgeBg: 'bg-gradient-to-tr from-[#0f766e] to-[#14b8a6]',
      btnClass: 'bg-[#0f766e] hover:bg-[#115e59] text-white',
      icon: <ShieldCheck size={22} className="text-white" />,
    },
    {
      id: 'secretary',
      titleAr: 'بوابة السكرتارية',
      titleEn: 'Secretary',
      subtitleAr: 'تنظيم المواعيد والطلبات والاستقبال',
      subtitleEn: 'Reception triage & queue',
      descAr: 'تنظيم قاعة الانتظار، استقبال وتأكيد وصول المراجعين، تنسيق جداول الأطباء، وتسهيل التواصل بين العيادة والمراكز المحيطة.',
      descEn: 'Front-desk reception triage: manages patient check-ins, waiting queues, and appointment schedules.',
      accentColor: '#7c3aed',
      cardBg: 'bg-white/95 hover:bg-violet-50/40',
      borderColor: 'border-slate-200/90 hover:border-violet-400',
      badgeBg: 'bg-gradient-to-tr from-[#7c3aed] to-[#8b5cf6]',
      btnClass: 'bg-[#7c3aed] hover:bg-[#6d28d9] text-white',
      icon: <Users size={22} className="text-white" />,
    },
    {
      id: 'wholesaler',
      titleAr: 'بوابة مجهزي الأدوية بالجملة',
      titleEn: 'Wholesale Medicine Suppliers',
      subtitleAr: 'توفير الأدوية والمستلزمات الصيدلانية',
      subtitleEn: 'B2B supply & batch orders',
      descAr: 'منظومة توريد الأدوية والمستلزمات الطبية للمذاخر والمكاتب العلمية في العراق لربطها بالصيدليات والمستشفيات مع الأسعار الرسمية.',
      descEn: 'B2B supply chain connecting licensed drug warehouses and scientific bureaus directly to retail pharmacies.',
      accentColor: '#d97706',
      cardBg: 'bg-white/95 hover:bg-amber-50/40',
      borderColor: 'border-slate-200/90 hover:border-amber-400',
      badgeBg: 'bg-gradient-to-tr from-[#d97706] to-[#f59e0b]',
      btnClass: 'bg-[#d97706] hover:bg-[#b45309] text-white',
      icon: <Truck size={22} className="text-white" />,
    },
    {
      id: 'radiology',
      titleAr: 'بوابة الأشعة والسونار',
      titleEn: 'Radiology and Ultrasound',
      subtitleAr: 'التصوير الطبي والتقارير المتخصصة',
      subtitleEn: 'Scans, imaging & findings',
      descAr: 'ربط مراكز الأشعة والسونار والتصوير بالرنين والمفراس لتسليم التقارير والصور الشعاعية مباشرة للأطباء والمرضى بأعلى دقة.',
      descEn: 'Connecting MRI, CT, ultrasound and X-ray imaging centers to deliver diagnostic scans securely.',
      accentColor: '#0284c7',
      cardBg: 'bg-white/95 hover:bg-sky-50/40',
      borderColor: 'border-slate-200/90 hover:border-sky-400',
      badgeBg: 'bg-gradient-to-tr from-[#0284c7] to-[#38bdf8]',
      btnClass: 'bg-[#0284c7] hover:bg-[#0369a1] text-white',
      icon: <Scan size={22} className="text-white" />,
    },
  ];

  const getActivityIcon = (category: string) => {
    switch (category) {
      case 'appointment':
        return <Calendar size={16} className="text-blue-600" />;
      case 'test':
        return <FlaskConical size={16} className="text-indigo-600" />;
      case 'supply':
        return <Truck size={16} className="text-amber-600" />;
      case 'prescription':
        return <FileText size={16} className="text-emerald-600" />;
      default:
        return <MessageCircle size={16} className="text-sky-600" />;
    }
  };

  const getActivityBg = (category: string) => {
    switch (category) {
      case 'appointment':
        return 'bg-blue-50';
      case 'test':
        return 'bg-indigo-50';
      case 'supply':
        return 'bg-amber-50';
      case 'prescription':
        return 'bg-emerald-50';
      default:
        return 'bg-sky-50';
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* 1. NEW MEDORA HERO BANNER */}
      <div className="w-full rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm border border-sky-200/80 bg-gradient-to-br from-[#dceeff] via-[#eef6ff] to-[#cfe5fa] flex items-center justify-center relative group">
        <img
          src="/assets/aistudio/file_00000000d0e08246a7817a4a6dd65913_c057d2c6.png"
          alt="MEDORA | ميدورا العراق — YOUR HEALTH • OUR PRIORITY"
          className="w-full h-auto max-h-[420px] sm:max-h-[460px] lg:max-h-[500px] object-contain object-center block transition-transform duration-700 group-hover:scale-[1.005]"
          loading="eager"
          fetchPriority="high"
        />
      </div>

      {/* 2. EIGHT PORTALS SECTION HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {language === 'ar' ? 'البوابات الطبية المستقلة' : 'Eight Medical Portals'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
            {language === 'ar' 
              ? 'اختر البوابة المطلوبة للوصول إلى بيئة العمل والخدمات المخصصة المعتمدة'
              : 'Select a portal to access your certified workspace and clinical services'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-bold text-[#003366] bg-blue-50 px-3 py-1 rounded-full border border-blue-200/60 font-mono">
            8 Portals • 8 بوابات
          </span>
        </div>
      </div>

      {/* 3. EIGHT PORTALS UNDER THE BANNER (1 col mobile, 2 cols tablet, 4 cols desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 lg:gap-5">
        {portalCards.map((portal) => (
          <div
            key={portal.id}
            className={`${portal.cardBg} ${portal.borderColor} rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-slate-900 flex flex-col justify-between shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-200 min-h-[250px] sm:min-h-[270px] group text-start relative overflow-hidden backdrop-blur-md border`}
          >
            {/* Top Micro Accent Line */}
            <div 
              className="absolute top-0 inset-x-0 h-1.5 transition-all group-hover:h-2"
              style={{ backgroundColor: portal.accentColor }}
            />

            <div>
              {/* Top Row: Icon Badge & English micro-tag */}
              <div className="flex items-center justify-between mb-3">
                <div 
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl ${portal.badgeBg} flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm shrink-0`}
                >
                  {portal.icon}
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-100/90 text-slate-600 border border-slate-200/60 truncate max-w-[130px]">
                  {portal.titleEn}
                </span>
              </div>

              {/* Primary Arabic Title */}
              <h3 className="font-black text-sm sm:text-base leading-snug text-slate-900 group-hover:text-[#003366] transition-colors">
                {portal.titleAr}
              </h3>

              {/* Subtitle / Focus tag */}
              <p className="text-[11px] sm:text-xs text-[#003366] font-bold mt-1 line-clamp-1">
                {language === 'ar' ? portal.subtitleAr : portal.subtitleEn}
              </p>

              {/* Professional Description */}
              <p className="text-[11px] text-slate-600 font-normal mt-2 leading-relaxed line-clamp-3">
                {language === 'ar' ? portal.descAr : portal.descEn}
              </p>
            </div>

            {/* Full-width Portal Access Button */}
            <button
              onClick={() => onSelectPortal(portal.id)}
              className={`mt-4 w-full py-2.5 px-3 rounded-xl ${portal.btnClass} font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-[0.98] min-h-[42px]`}
            >
              <span>{language === 'ar' ? 'دخول البوابة' : 'Open Portal'}</span>
              <span className="transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                {isRTL ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
              </span>
            </button>
          </div>
        ))}
      </div>

      {/* 3. LOWER 3 PANELS: إحصائيات سريعة | أحدث النشاطات | صحتك .. أولويتنا */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        {/* Panel 1 (Left in RTL): إحصائيات سريعة (Starts at ZERO, Real Live Counters Only) */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-white/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BarChart3 size={19} className="text-blue-700" />
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  {language === 'ar' ? 'إحصائيات سريعة' : 'Quick Statistics'}
                </h3>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {language === 'ar' ? 'بيانات حقيقية' : 'Real-time Live'}
              </span>
            </div>

            {/* 2x2 Grid with real animated count-up numbers */}
            <div className="grid grid-cols-2 gap-3">
              {/* Stat 1: عدد المواعيد اليوم */}
              <div 
                onClick={() => onSelectPortal('patient')}
                className="p-3.5 rounded-2xl bg-purple-50/70 hover:bg-purple-50 border border-purple-100 hover:border-purple-200 transition-all flex items-center justify-between cursor-pointer group"
                title={language === 'ar' ? 'حجوزات المواعيد الحقيقية المسجلة' : 'Real booked appointments'}
              >
                <div>
                  <span className="text-[11px] font-medium text-slate-600 block">
                    {language === 'ar' ? 'عدد المواعيد اليوم' : 'Appointments Today'}
                  </span>
                  {/* Ascending Count Up Number - Starts at 0 */}
                  <span className="text-xl font-black text-slate-900 block mt-0.5 font-mono tracking-tight group-hover:text-purple-700 transition-colors">
                    {animatedAppointments.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {realMetrics.appointmentsToday > 0 ? (language === 'ar' ? 'حجز مسجل' : 'Booked') : (language === 'ar' ? 'لا توجد حجوزات' : 'No bookings')}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Calendar size={18} />
                </div>
              </div>

              {/* Stat 2: عدد المستخدمين النشطين */}
              <div 
                onClick={() => onSelectPortal('super_admin')}
                className="p-3.5 rounded-2xl bg-blue-50/70 hover:bg-blue-50 border border-blue-100 hover:border-blue-200 transition-all flex items-center justify-between cursor-pointer group"
                title={language === 'ar' ? 'المستخدمون والكوادر المعتمدة الحقيقية' : 'Real registered active users'}
              >
                <div>
                  <span className="text-[11px] font-medium text-slate-600 block">
                    {language === 'ar' ? 'عدد المستخدمين النشطين' : 'Active Users'}
                  </span>
                  {/* Ascending Count Up Number - Starts at 0 */}
                  <span className="text-xl font-black text-slate-900 block mt-0.5 font-mono tracking-tight group-hover:text-blue-700 transition-colors">
                    {animatedUsers.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {realMetrics.activeUsers > 0 ? (language === 'ar' ? 'حساب مسجل' : 'Registered') : (language === 'ar' ? 'لا يوجد مستخدمون' : 'No users')}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Users size={18} />
                </div>
              </div>

              {/* Stat 3: التحاليل والفحوصات */}
              <div 
                onClick={() => onSelectPortal('laboratory')}
                className="p-3.5 rounded-2xl bg-rose-50/70 hover:bg-rose-50 border border-rose-100 hover:border-rose-200 transition-all flex items-center justify-between cursor-pointer group"
                title={language === 'ar' ? 'الفحوصات والتحاليل الحقيقية الصادرة' : 'Real lab and radiology tests'}
              >
                <div>
                  <span className="text-[11px] font-medium text-slate-600 block">
                    {language === 'ar' ? 'التحاليل والفحوصات' : 'Tests & Scans'}
                  </span>
                  {/* Ascending Count Up Number - Starts at 0 */}
                  <span className="text-xl font-black text-slate-900 block mt-0.5 font-mono tracking-tight group-hover:text-rose-700 transition-colors">
                    {animatedTests.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {realMetrics.diagnosticTests > 0 ? (language === 'ar' ? 'فحص منجز' : 'Completed') : (language === 'ar' ? 'لا توجد فحوصات' : 'No tests')}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <FlaskConical size={18} />
                </div>
              </div>

              {/* Stat 4: الوصفات الإلكترونية */}
              <div 
                onClick={() => onSelectPortal('pharmacy')}
                className="p-3.5 rounded-2xl bg-emerald-50/70 hover:bg-emerald-50 border border-emerald-100 hover:border-emerald-200 transition-all flex items-center justify-between cursor-pointer group"
                title={language === 'ar' ? 'الوصفات والطلبات الحقيقية' : 'Real prescriptions and pharmacy orders'}
              >
                <div>
                  <span className="text-[11px] font-medium text-slate-600 block">
                    {language === 'ar' ? 'الوصفات الإلكترونية' : 'e-Prescriptions'}
                  </span>
                  {/* Ascending Count Up Number - Starts at 0 */}
                  <span className="text-xl font-black text-slate-900 block mt-0.5 font-mono tracking-tight group-hover:text-emerald-700 transition-colors">
                    {animatedPrescriptions.toLocaleString('en-US')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {realMetrics.prescriptions > 0 ? (language === 'ar' ? 'وصفة معتمدة' : 'Dispensed') : (language === 'ar' ? 'لا توجد وصفات' : 'No prescriptions')}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <FileText size={18} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>{language === 'ar' ? 'إحصائيات فعلية 100% بدون أي أرقام وهمية' : '100% authentic counts without placeholder values'}</span>
            <span className="text-emerald-600 font-bold font-mono">Real-Time</span>
          </div>
        </div>

        {/* Panel 2 (Middle in RTL): أحدث النشاطات (Purely Real Activities) */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-white/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock size={19} className="text-blue-700" />
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  {language === 'ar' ? 'أحدث النشاطات' : 'Recent Activities'}
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {activities.length} {language === 'ar' ? 'نشاط مسجل' : 'activities'}
              </span>
            </div>

            {/* Activities List or Empty State */}
            {isLoadingActivities ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                {language === 'ar' ? 'جاري التحقق من النشاطات المسجلة...' : 'Checking real recorded activities...'}
              </div>
            ) : activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${getActivityBg(act.category)} flex items-center justify-center shrink-0`}>
                        {getActivityIcon(act.category)}
                      </div>
                      <span className="text-xs font-semibold text-slate-800 line-clamp-1">
                        {act.title}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap font-medium ps-2">
                      {act.timeFormatted}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              /* Clean Authentic Empty State - No fake activity fabricated */
              <div className="py-8 px-4 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                  <Inbox size={24} />
                </div>
                <h4 className="text-xs font-bold text-slate-700 mb-1">
                  {language === 'ar' ? 'لا توجد نشاطات مسجلة حتى الآن' : 'No recorded activities yet'}
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs mb-3">
                  {language === 'ar'
                    ? 'ستظهر هنا تلقائياً الحجوزات والوصفات الطبية فور تسجيلها في المنظومة.'
                    : 'Real appointments, lab tests, and prescriptions will appear here live once booked.'}
                </p>
                <button
                  onClick={() => onSelectPortal('patient')}
                  className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'حجز أول موعد طبي' : 'Book First Appointment'}
                </button>
              </div>
            )}
          </div>

          {/* Bottom link: عرض جميع النشاطات */}
          <div className="pt-3 mt-3 border-t border-slate-100">
            <button
              onClick={() => onNavigate('portals')}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>{language === 'ar' ? 'استعراض كافة البوابات' : 'Explore All Portals'}</span>
              {isRTL ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
            </button>
          </div>
        </div>

        {/* Panel 3: System Overview (Clean, unbranded, no promotional background image) */}
        <div className="rounded-3xl shadow-sm border border-white/80 min-h-[300px] flex flex-col justify-between text-slate-800 p-6 bg-white/95 backdrop-blur-md">
          {/* Top text */}
          <div className="text-center pt-2">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {language === 'ar' ? 'منظومة الرعاية الصحية الموحدة' : 'Unified Healthcare Ecosystem'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              {language === 'ar'
                ? 'ربط مباشر ومتكامل بين المراكز الطبية والعيادات والمراجعين'
                : 'Direct interoperability across clinics, diagnostics, and patients'}
            </p>
          </div>

          {/* 3 Value Pillars at bottom */}
          <div className="grid grid-cols-3 gap-2 pt-6">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center flex flex-col items-center justify-center">
              <Share2 size={18} className="text-sky-600 mb-1.5" />
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                {language === 'ar' ? 'ربط متكامل بين جميع الأبواب' : 'Unified Ecosystem'}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center flex flex-col items-center justify-center">
              <Zap size={18} className="text-amber-600 mb-1.5" />
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                {language === 'ar' ? 'خدمات سريعة وسهلة' : 'Instant & Frictionless'}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-center flex flex-col items-center justify-center">
              <ShieldCheck size={18} className="text-emerald-600 mb-1.5" />
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-tight">
                {language === 'ar' ? 'أمان عالي لبياناتك' : 'Top Security'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
