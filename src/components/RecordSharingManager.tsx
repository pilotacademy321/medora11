import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDocs 
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../lib/firebase';
import { useLanguage } from '../context/LanguageContext';
import { RecordSharingPermission, DoctorProfile } from '../types';
import { dispatchM737Notification } from '../lib/pushEventDispatcher';
import { 
  Share2, 
  ShieldCheck, 
  Clock, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Plus, 
  RefreshCw, 
  Lock, 
  Calendar,
  X
} from 'lucide-react';

interface RecordSharingManagerProps {
  patientUid: string;
  patientName: string;
  patientMedicalId: string;
  onClose?: () => void;
}

export const RecordSharingManager: React.FC<RecordSharingManagerProps> = ({
  patientUid,
  patientName,
  patientMedicalId,
  onClose
}) => {
  const { language, isRTL } = useLanguage();

  const [permissions, setPermissions] = useState<RecordSharingPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorsList, setDoctorsList] = useState<DoctorProfile[]>([]);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState<'24h' | '7d' | '30d' | 'never'>('7d');
  const [selectedTypes, setSelectedTypes] = useState<Array<'all' | 'lab_result' | 'radiology_report' | 'prescription' | 'clinical_note'>>(['all']);

  // 1. Fetch available verified doctors from /doctor_profiles
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const snap = await getDocs(collection(db, 'doctor_profiles'));
        const docs = snap.docs.map((d) => ({
          doctorId: d.id,
          ...d.data(),
        } as DoctorProfile));
        setDoctorsList(docs);
        if (docs.length > 0) {
          setSelectedDoctorId(docs[0].doctorId);
        }
      } catch (err) {
        console.warn('Notice fetching doctor profiles:', err);
      }
    };
    fetchDoctors();
  }, []);

  // 2. Subscribe to patient's active and historical sharing permissions
  useEffect(() => {
    if (!patientUid) return;

    setLoading(true);
    const q = query(
      collection(db, 'record_sharing_permissions'),
      where('patientId', '==', patientUid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const perms = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as RecordSharingPermission));
        setPermissions(perms);
        setLoading(false);
      },
      (err) => {
        console.warn('Permissions snapshot notice:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [patientUid]);

  // Handle Granting new permission
  const handleGrantPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId) {
      setErrorMsg(language === 'ar' ? 'يرجى اختيار الطبيب المطلوب' : 'Please select a doctor');
      return;
    }

    const doctor = doctorsList.find((d) => d.doctorId === selectedDoctorId);
    if (!doctor) return;

    setSubmitting(true);
    setErrorMsg(null);

    const permId = `perm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    let expiresAt = 'never';

    if (selectedExpiry === '24h') {
      expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    } else if (selectedExpiry === '7d') {
      expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (selectedExpiry === '30d') {
      expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const newPerm: RecordSharingPermission = {
      id: permId,
      patientId: patientUid,
      patientMedicalId,
      patientName,
      targetDoctorId: doctor.doctorId,
      targetDoctorName: doctor.fullName,
      targetDoctorSpecialty: doctor.specialty,
      recordTypes: selectedTypes,
      expiresAt,
      status: 'active',
      createdAt: now.toISOString(),
    };

    try {
      await setDoc(doc(db, 'record_sharing_permissions', permId), sanitizeForFirestore(newPerm));
      setShowGrantModal(false);
      setSuccessMsg(
        language === 'ar'
          ? `تم منح إذن الاطلاع الطبي بنجاح لـ (${doctor.fullName})`
          : `Record access granted to ${doctor.fullName}`
      );

      // Notify the target doctor via push/in-app notification
      await dispatchM737Notification({
        recipientUid: doctor.doctorId,
        recipientRole: 'doctor',
        category: 'general',
        titleAr: 'إذن اطلاع طبي جديد من مريض',
        titleEn: 'New Medical Record Sharing Permission',
        messageAr: `منحك المريض (${patientName} - المعرف: ${patientMedicalId}) صلاحية الاطلاع على سجلاته الطبية.`,
        messageEn: `Patient (${patientName} - ID: ${patientMedicalId}) granted you access to their medical records.`,
        targetPortal: 'doctor',
        targetUrl: '/doctor',
        priority: 'normal',
      }).catch(console.warn);
    } catch (err: unknown) {
      console.error('Error creating sharing permission:', err);
      setErrorMsg(language === 'ar' ? 'فشل حفظ إذن المشاركة' : 'Failed to save sharing permission');
    } finally {
      setSubmitting(false);
    }
  };

  // Revoke an active permission immediately
  const handleRevokePermission = async (permId: string) => {
    try {
      await updateDoc(doc(db, 'record_sharing_permissions', permId), {
        status: 'revoked',
        revokedAt: new Date().toISOString(),
      });
      setSuccessMsg(language === 'ar' ? 'تم إلغاء تصريح المشاركة بنجاح' : 'Permission revoked successfully');
    } catch (err) {
      console.error('Error revoking permission:', err);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xl border border-slate-200 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#003366] text-white flex items-center justify-center shadow-xs">
            <Share2 size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base sm:text-lg text-slate-900">
              {language === 'ar' ? 'إدارة مشاركة السجلات الطبية مع الأطباء' : 'Patient-Controlled Medical Record Sharing'}
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'ar' 
                ? 'تحكّم بمن يطلع على تقاريرك وفحوصاتك، وحدد مدة الصلاحية وإمكانية الإلغاء الفوري'
                : 'Grant time-bound access to consulting doctors with instant revocation control'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrantModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] shadow-xs cursor-pointer transition-all"
          >
            <Plus size={16} />
            <span>{language === 'ar' ? 'مشاركة سجل مع طبيب' : 'Grant Doctor Access'}</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Permissions List */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {language === 'ar' ? 'أذونات المشاركة الحالية وسجل الصلاحيات:' : 'Active & Past Sharing Authorizations:'}
        </h4>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw size={20} className="animate-spin text-[#003366]" />
            <span>{language === 'ar' ? 'جارٍ تحميل الأذونات...' : 'Loading permissions...'}</span>
          </div>
        ) : permissions.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-slate-200 text-center text-xs text-slate-400 space-y-2">
            <ShieldCheck size={28} className="mx-auto text-slate-300" />
            <p className="font-bold text-slate-700">
              {language === 'ar' ? 'سجلك الطبي محمي وخاص تماماً' : 'Your medical records are fully private'}
            </p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              {language === 'ar'
                ? 'لم يتم منح أي طبيب صلاحية الاطلاع على ملفاتك حتى الآن. يمكنك منح إذن محدد عند الحاجة للاستشارة.'
                : 'No doctor has been granted access. You can grant temporary access whenever you need a consultation.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white">
            {permissions.map((perm) => {
              const isExpired = perm.expiresAt !== 'never' && new Date(perm.expiresAt).getTime() < Date.now();
              const isRevoked = perm.status === 'revoked';
              const isActive = perm.status === 'active' && !isExpired;

              return (
                <div key={perm.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{perm.targetDoctorName}</span>
                      {perm.targetDoctorSpecialty && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                          {perm.targetDoctorSpecialty}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : isRevoked
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isActive
                          ? (language === 'ar' ? 'ساري المفعول' : 'Active')
                          : isRevoked
                          ? (language === 'ar' ? 'تم الإلغاء' : 'Revoked')
                          : (language === 'ar' ? 'منتهي الصلاحية' : 'Expired')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={13} className="text-slate-400" />
                        <span>{language === 'ar' ? 'تاريخ المنح:' : 'Granted:'} {new Date(perm.createdAt).toLocaleDateString(language === 'ar' ? 'ar-IQ' : 'en-US')}</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-slate-400" />
                        <span>
                          {perm.expiresAt === 'never'
                            ? (language === 'ar' ? 'صلاحية دائمة حتى الإلغاء' : 'Permanent until revoked')
                            : `${language === 'ar' ? 'ينتهي في:' : 'Expires:'} ${new Date(perm.expiresAt).toLocaleDateString(language === 'ar' ? 'ar-IQ' : 'en-US')}`}
                        </span>
                      </span>

                      <span>
                        {language === 'ar' ? 'نطاق السجلات:' : 'Scope:'}{' '}
                        {perm.recordTypes.includes('all')
                          ? (language === 'ar' ? 'كافة السجلات والتقارير' : 'All clinical records')
                          : perm.recordTypes.join(', ')}
                      </span>
                    </div>
                  </div>

                  {isActive && (
                    <button
                      type="button"
                      onClick={() => handleRevokePermission(perm.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer self-start sm:self-center"
                    >
                      <Trash2 size={14} />
                      <span>{language === 'ar' ? 'إلغاء الصلاحية فوراً' : 'Revoke Access'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grant Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-start">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-bold text-base text-slate-900">
                {language === 'ar' ? 'منح إذن اطلاع طبي جديد' : 'Grant Medical Access Permission'}
              </h4>
              <button
                onClick={() => setShowGrantModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-800 text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleGrantPermission} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'ar' ? 'اختر الطبيب المعالج المصرح له *' : 'Select Authorized Doctor *'}
                </label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm bg-white"
                  required
                >
                  {doctorsList.map((docItem) => (
                    <option key={docItem.doctorId} value={docItem.doctorId}>
                      {docItem.fullName} — {docItem.specialty} ({docItem.clinicAddress})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'ar' ? 'مدة سريان الصلاحية:' : 'Permission Duration:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: '24h', labelAr: '24 ساعة', labelEn: '24 Hours' },
                    { id: '7d', labelAr: '7 أيام', labelEn: '7 Days' },
                    { id: '30d', labelAr: '30 يوماً', labelEn: '30 Days' },
                    { id: 'never', labelAr: 'دائمة', labelEn: 'Permanent' },
                  ].map((dur) => (
                    <button
                      key={dur.id}
                      type="button"
                      onClick={() => setSelectedExpiry(dur.id as any)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                        selectedExpiry === dur.id
                          ? 'border-[#003366] bg-[#003366] text-white shadow-xs'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {language === 'ar' ? dur.labelAr : dur.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'ar' ? 'نوع السجلات المصرح بالاطلاع عليها:' : 'Authorized Records Scope:'}
                </label>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>{language === 'ar' ? 'كافة التقارير والفحوصات والوصفات' : 'All clinical reports & prescriptions'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {language === 'ar'
                      ? 'يشمل تقارير المختبر، وصور وفحوصات الأشعة، والوصفات الطبية والملاحظات السريرية الموثقة.'
                      : 'Includes pathology labs, radiology imaging, prescriptions, and clinical notes.'}
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGrantModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedDoctorId}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#003366] hover:bg-[#002244] disabled:opacity-40 shadow-xs cursor-pointer"
                >
                  {submitting
                    ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')
                    : (language === 'ar' ? 'تأكيد منح الإذن' : 'Confirm Permission')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
