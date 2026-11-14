import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType, sanitizeForFirestore } from '../lib/firebase';
import { isVerifiedSuperAdmin } from '../utils/adminSecurity';
import { logAuditEvent } from '../lib/auditLogger';
import { isRoleSuspended } from '../config/portalsConfig';
import { useLanguage } from '../context/LanguageContext';
import {
  Conversation,
  ChatMessage,
  UserRole,
} from '../types';
import {
  formatBytesCompact,
  uploadChatAttachmentFile,
  UploadProgressInfo,
} from '../lib/medicalStorage';
import { dispatchM737Notification } from '../lib/pushEventDispatcher';
import {
  AuthorizedMessagingPeer,
  MessagingCategoryDescriptor,
  buildScopedConversationId,
  canCommunicateWithPeer,
  getAuthorizedCategoriesForRole,
  getConversationParticipantIds,
  getConversationPeerDisplay,
  getUnreadCountForUser,
  loadAuthorizedMessagingPeers,
  roleToPortalId,
} from '../utils/messagingPermissions';
import {
  Send,
  Paperclip,
  User,
  Stethoscope,
  Clock,
  Check,
  CheckCheck,
  FileText,
  Download,
  Search,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  X,
  Plus,
  FlaskConical,
  Pill,
  Building2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Lock,
  Scan,
  Eye,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  Wifi,
  WifiOff,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import {
  MAX_CHAT_MESSAGE_LENGTH,
  LocalOutboxMessage,
  classifyMessagingError,
  createClientMessageId,
  mergeAndSortConversationMessages,
  runWithNetworkTimeout,
  validateAndNormalizeMessageText,
} from '../utils/messagingEngine';

interface PrivateMessagingWorkspaceProps {
  currentUserUid: string;
  currentUserName: string;
  currentUserRole: UserRole;
  initialTargetUid?: string;
  initialTargetName?: string;
  initialTargetRole?: UserRole;
  onClose?: () => void;
}

export const PrivateMessagingWorkspace: React.FC<PrivateMessagingWorkspaceProps> = ({
  currentUserUid,
  currentUserName,
  currentUserRole,
  initialTargetUid,
  initialTargetName,
  initialTargetRole,
  onClose,
}) => {
  const { language, isRTL } = useLanguage();

  const authorizedCategories = useMemo(
    () => getAuthorizedCategoriesForRole(currentUserRole).filter((c) => !isRoleSuspended(c.role)),
    [currentUserRole]
  );

  // Step 1 -> Step 2 Category Navigation State
  const [selectedCategory, setSelectedCategory] = useState<UserRole | null>(() => {
    if (initialTargetRole && authorizedCategories.some((c) => c.role === initialTargetRole)) {
      return initialTargetRole;
    }
    return null;
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [authorizedPeers, setAuthorizedPeers] = useState<AuthorizedMessagingPeer[]>([]);
  const [loadingPeers, setLoadingPeers] = useState(true);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outboxByConv, setOutboxByConv] = useState<Record<string, LocalOutboxMessage[]>>({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentUploadInfo, setAttachmentUploadInfo] = useState<UploadProgressInfo | null>(null);
  const [failedAttachmentFile, setFailedAttachmentFile] = useState<{ convId: string; file: File } | null>(null);
  const attachmentCancelRef = useRef<(() => void) | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showContactsSubtab, setShowContactsSubtab] = useState<'threads' | 'contacts'>('threads');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [sendStatusNotice, setSendStatusNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [snapshotEpoch, setSnapshotEpoch] = useState(0);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [authReadyUid, setAuthReadyUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [serverConfirmedConvIds, setServerConfirmedConvIds] = useState<Set<string>>(() => new Set());

  // Super Admin Server-Verified Oversight State
  const [adminOversightVerified, setAdminOversightVerified] = useState(false);
  const [adminOversightStatus, setAdminOversightStatus] = useState<'idle' | 'verifying' | 'verified' | 'denied'>('idle');
  const [adminOversightFilter, setAdminOversightFilter] = useState<'all' | 'support' | 'attachments'>('all');
  const auditedOversightViewsRef = useRef<Set<string>>(new Set());
  const handledInitialTargetRef = useRef<string | null>(null);
  const lastFailedDraftRef = useRef<{ convId: string; text: string; msgId: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track real browser connectivity changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSendStatusNotice({
        type: 'info',
        text:
          language === 'ar'
            ? 'عاد الاتصال بالإنترنت. يمكنك الآن إعادة إرسال أي رسائل معلّقة.'
            : 'Connection restored. You can retry any pending messages.',
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSendStatusNotice({
        type: 'error',
        text:
          language === 'ar'
            ? 'انقطع الاتصال بالإنترنت. لن يتم إرسال أو حذف رسائلك المكتوبة حتى يعود الاتصال.'
            : 'Internet connection lost. Typed messages are preserved until connection returns.',
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [language]);

  // Auto-resize multiline textarea cleanly
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [messageText]);

  const renderedMessages = useMemo(() => {
    const activeOutbox = activeConversation?.id ? outboxByConv[activeConversation.id] || [] : [];
    return mergeAndSortConversationMessages(messages, activeOutbox);
  }, [messages, outboxByConv, activeConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [renderedMessages.length]);

  // 0. Server-side Super Admin Oversight Verification (Bearer token checked by /api/admin/verify-oversight)
  useEffect(() => {
    let active = true;
    if (currentUserRole !== 'super_admin') {
      setAdminOversightVerified(false);
      setAdminOversightStatus('idle');
      return;
    }

    const verifyOversight = async () => {
      setAdminOversightStatus('verifying');
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          if (active) {
            setAdminOversightVerified(false);
            setAdminOversightStatus('denied');
          }
          return;
        }
        const resp = await fetch('/api/admin/verify-oversight', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
        if (resp.status === 404 || resp.status === 405 || contentType.includes('text/html')) {
          // Static host (Netlify SPA fallback): allow verified Super Admin directly via Auth + Firestore Rules
          if (!active) return;
          if (isVerifiedSuperAdmin(auth.currentUser)) {
            setAdminOversightVerified(true);
            setAdminOversightStatus('verified');
          } else {
            setAdminOversightVerified(false);
            setAdminOversightStatus('denied');
          }
          return;
        }
        const data = await resp.json().catch(() => ({}));
        if (!active) return;
        if (resp.ok && data?.verified) {
          setAdminOversightVerified(true);
          setAdminOversightStatus('verified');
        } else {
          setAdminOversightVerified(false);
          setAdminOversightStatus('denied');
        }
      } catch {
        if (active) {
          if (isVerifiedSuperAdmin(auth.currentUser)) {
            setAdminOversightVerified(true);
            setAdminOversightStatus('verified');
          } else {
            setAdminOversightVerified(false);
            setAdminOversightStatus('denied');
          }
        }
      }
    };

    verifyOversight();
    return () => {
      active = false;
    };
  }, [currentUserRole, currentUserUid]);

  // Track live Firebase Auth readiness so Firestore listeners never attach before auth is ready
  useEffect(() => {
    setAuthReadyUid(auth.currentUser?.uid ?? null);
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setAuthReadyUid(fbUser?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // 1. Load authorized relationship-scoped peers for the signed-in role
  useEffect(() => {
    let active = true;
    if (!currentUserUid || !authReadyUid || authReadyUid !== currentUserUid) {
      setLoadingPeers(false);
      return;
    }
    setLoadingPeers(true);
    loadAuthorizedMessagingPeers(db, currentUserUid, currentUserRole)
      .then((peers) => {
        if (!active) return;
        setAuthorizedPeers(peers);
        setLoadingPeers(false);
      })
      .catch(() => {
        if (active) setLoadingPeers(false);
      });
    return () => {
      active = false;
    };
  }, [currentUserUid, currentUserRole, authReadyUid]);

  // 2. Subscribe to real-time conversations (unified participantIds + legacy fallback)
  useEffect(() => {
    if (!currentUserUid || !authReadyUid || authReadyUid !== currentUserUid) {
      setConversations([]);
      setServerConfirmedConvIds(new Set());
      setLoadingConversations(false);
      return;
    }

    setLoadingConversations(true);
    setConversationsError(null);
    const mergedMap = new Map<string, Conversation>();
    const confirmedSet = new Set<string>();

    const syncState = () => {
      const sorted = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
      setConversations(sorted);
      setServerConfirmedConvIds(new Set(confirmedSet));
      setActiveConversation((prev) => {
        if (!prev) return prev;
        const fresh = mergedMap.get(prev.id);
        return fresh ? fresh : prev;
      });
      setLoadingConversations(false);
    };

    const handleSubError = (err: unknown, pathDesc: string) => {
      const classified = classifyMessagingError(err, typeof navigator !== 'undefined' ? navigator.onLine : true);
      console.error(`[Messaging] Conversation snapshot error (${pathDesc}):`, err);
      setConversationsError(language === 'ar' ? classified.messageAr : classified.messageEn);
      setLoadingConversations(false);
    };

    const unsubscribers: Array<() => void> = [];

    const subscribeScopedParticipantConversations = () => {
      const qUnified = query(
        collection(db, 'conversations'),
        where('participantIds', 'array-contains', currentUserUid)
      );
      unsubscribers.push(
        onSnapshot(
          qUnified,
          { includeMetadataChanges: true },
          (snap) => {
            snap.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                mergedMap.delete(change.doc.id);
                confirmedSet.delete(change.doc.id);
              }
            });
            snap.docs.forEach((d) => {
              mergedMap.set(d.id, { id: d.id, ...d.data() } as Conversation);
              if (!d.metadata.hasPendingWrites) {
                confirmedSet.add(d.id);
              }
            });
            setConversationsError(null);
            syncState();
          },
          (err) => handleSubError(err, 'conversations(participantIds)')
        )
      );

      if (currentUserRole === 'doctor' || currentUserRole === 'patient') {
        const legacyField = currentUserRole === 'doctor' ? 'doctorId' : 'patientId';
        const qLegacy = query(
          collection(db, 'conversations'),
          where(legacyField, '==', currentUserUid)
        );
        unsubscribers.push(
          onSnapshot(
            qLegacy,
            { includeMetadataChanges: true },
            (snap) => {
              snap.docs.forEach((d) => {
                mergedMap.set(d.id, { id: d.id, ...d.data() } as Conversation);
                if (!d.metadata.hasPendingWrites) {
                  confirmedSet.add(d.id);
                }
              });
              syncState();
            },
            (err) => handleSubError(err, `conversations(${legacyField})`)
          )
        );
      }
    };

    const canSubscribeGlobalAdmin =
      currentUserRole === 'super_admin' &&
      adminOversightVerified &&
      isVerifiedSuperAdmin(auth.currentUser) &&
      auth.currentUser?.uid === currentUserUid;

    if (currentUserRole === 'super_admin') {
      if (adminOversightStatus === 'verifying' || adminOversightStatus === 'idle') {
        // Subscribe to direct participant threads while server-side Super Admin oversight verifies
        subscribeScopedParticipantConversations();
      } else if (canSubscribeGlobalAdmin) {
        let adminListenerActive = true;
        const unsubAll = onSnapshot(
          collection(db, 'conversations'),
          { includeMetadataChanges: true },
          (snap) => {
            mergedMap.clear();
            confirmedSet.clear();
            snap.docs.forEach((d) => {
              mergedMap.set(d.id, { id: d.id, ...d.data() } as Conversation);
              if (!d.metadata.hasPendingWrites) {
                confirmedSet.add(d.id);
              }
            });
            setConversationsError(null);
            syncState();
          },
          (err) => {
            const classified = classifyMessagingError(err, typeof navigator !== 'undefined' ? navigator.onLine : true);
            if (classified.code === 'permission-denied' && adminListenerActive) {
              adminListenerActive = false;
              console.warn('[Messaging] Global admin oversight listener denied by Firestore rules; falling back to direct participant conversations.');
              unsubAll();
              subscribeScopedParticipantConversations();
              return;
            }
            handleSubError(err, 'conversations(admin)');
          }
        );
        unsubscribers.push(unsubAll);
      } else {
        // Oversight verification denied or non-verified session: strictly scope to direct participant threads
        subscribeScopedParticipantConversations();
      }
    } else {
      subscribeScopedParticipantConversations();
    }

    return () => {
      unsubscribers.forEach((fn) => fn());
    };
  }, [currentUserUid, currentUserRole, authReadyUid, adminOversightVerified, adminOversightStatus, language, snapshotEpoch]);

  // Helper: inspect conversation participants list (for Super Admin oversight display)
  const getConversationParticipantsList = (conv: Conversation) => {
    const ids = getConversationParticipantIds(conv);
    return ids.map((uid) => {
      const meta = conv.participants?.[uid];
      if (meta) {
        return {
          uid,
          name: meta.name || uid,
          role: meta.role || 'patient',
          subtitle: meta.specialtyOrFacility || meta.accountId,
        };
      }
      if (conv.doctorId === uid) {
        return { uid, name: conv.doctorName || 'Doctor', role: 'doctor' as UserRole, subtitle: conv.doctorSpecialty };
      }
      if (conv.patientId === uid) {
        return { uid, name: conv.patientName || 'Patient', role: 'patient' as UserRole, subtitle: conv.patientMedicalId };
      }
      return { uid, name: uid, role: 'patient' as UserRole };
    });
  };

  // Helper: audit Super Admin third-party conversation inspection
  const auditSuperAdminOversightAction = async (
    conv: Conversation,
    action: 'super_admin_conversation_viewed' | 'super_admin_support_message_sent',
    details: string
  ) => {
    if (currentUserRole !== 'super_admin') return;
    const isDirectAdminThread = getConversationParticipantIds(conv).includes(currentUserUid);
    if (action === 'super_admin_conversation_viewed') {
      if (isDirectAdminThread || auditedOversightViewsRef.current.has(conv.id)) return;
      auditedOversightViewsRef.current.add(conv.id);
    }

    const participants = getConversationParticipantsList(conv);
    logAuditEvent({
      category: 'messaging_oversight',
      action,
      actorUid: currentUserUid,
      actorName: currentUserName,
      actorRole: 'super_admin',
      targetUid: participants[0]?.uid,
      targetName: participants.map((p) => p.name).join(' ↔ '),
      resourceId: conv.id,
      status: 'logged',
      details,
    }).catch(() => {});

    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        await fetch('/api/admin/audit-message-access', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            conversationId: conv.id,
            action,
            participantUids: participants.map((p) => p.uid),
            relationshipType: conv.relationshipType,
            details,
          }),
        });
      }
    } catch {
      // Non-blocking audit call
    }
  };

  // Helper to select a conversation cleanly (with Super Admin oversight verification & audit)
  const handleSelectConversation = (conv: Conversation) => {
    const isDirectMember = getConversationParticipantIds(conv).includes(currentUserUid);
    if (currentUserRole === 'super_admin' && !isDirectMember && !adminOversightVerified) {
      setErrorMsg(
        language === 'ar'
          ? 'تعذر التحقق من صلاحية الإشراف على الخادم لهذه المحادثة.'
          : 'Server-side Super Admin oversight verification required to view third-party threads.'
      );
      return;
    }

    setActiveConversation(conv);
    setMobileShowThread(true);
    setErrorMsg(null);

    if (currentUserRole === 'super_admin' && !isDirectMember) {
      const participants = getConversationParticipantsList(conv);
      auditSuperAdminOversightAction(
        conv,
        'super_admin_conversation_viewed',
        `Super Admin inspected ${conv.relationshipType} thread between ${participants.map((p) => `${p.name} (${p.role})`).join(' & ')}`
      );
    }
  };

  // Helper to open or prepare a scoped conversation with an authorized peer
  const openConversationWithPeer = (peer: AuthorizedMessagingPeer) => {
    const authCheck = canCommunicateWithPeer({
      senderRole: currentUserRole,
      senderUid: currentUserUid,
      targetRole: peer.role,
      targetUid: peer.uid,
      hasVerifiedRelationship: true,
    });

    if (!authCheck.allowed || !authCheck.relationshipType) {
      setErrorMsg(
        language === 'ar'
          ? 'غير مصرح بإنشاء محادثة خارج نطاق العلاقات الطبية أو الاشتراك المعتمدة.'
          : authCheck.reason || 'Conversation not authorized'
      );
      return;
    }

    if (authorizedCategories.some((c) => c.role === peer.role)) {
      setSelectedCategory(peer.role);
    }

    const existing = conversations.find((c) => {
      const ids = getConversationParticipantIds(c);
      return ids.includes(peer.uid) && ids.includes(currentUserUid);
    });

    if (existing) {
      setActiveConversation(existing);
      setShowContactsSubtab('threads');
      setMobileShowThread(true);
      setErrorMsg(null);
      return;
    }

    const now = new Date().toISOString();
    const convId = buildScopedConversationId(currentUserUid, peer.uid, authCheck.relationshipType);
    const isDoctorPatient = authCheck.relationshipType === 'doctor_patient';
    const doctorUid = currentUserRole === 'doctor' ? currentUserUid : peer.role === 'doctor' ? peer.uid : undefined;
    const patientUid = currentUserRole === 'patient' ? currentUserUid : peer.role === 'patient' ? peer.uid : undefined;

    const stubConv: Conversation = {
      id: convId,
      participantIds: [currentUserUid, peer.uid].sort(),
      participants: {
        [currentUserUid]: {
          uid: currentUserUid,
          role: currentUserRole,
          name: currentUserName,
        },
        [peer.uid]: {
          uid: peer.uid,
          role: peer.role,
          name: peer.name,
          accountId: peer.accountId,
          specialtyOrFacility: peer.subtitle,
        },
      },
      relationshipType: authCheck.relationshipType,
      relationshipRefId: peer.relationshipRefId,
      unreadCounts: {
        [currentUserUid]: 0,
        [peer.uid]: 0,
      },
      ...(isDoctorPatient && doctorUid && patientUid
        ? {
            doctorId: doctorUid,
            doctorName: currentUserRole === 'doctor' ? currentUserName : peer.name,
            patientId: patientUid,
            patientName: currentUserRole === 'patient' ? currentUserName : peer.name,
          }
        : {}),
      lastMessageText: '',
      lastMessageTimestamp: now,
      lastSenderUid: currentUserUid,
      unreadByDoctor: 0,
      unreadByPatient: 0,
      createdAt: now,
      updatedAt: now,
    };

    setActiveConversation(stubConv);
    setShowContactsSubtab('threads');
    setMobileShowThread(true);
    setErrorMsg(null);
  };

  // Auto-open initialTargetUid once per target ONLY if authorized or existing conversation
  useEffect(() => {
    if (!initialTargetUid || loadingPeers || loadingConversations) return;
    if (handledInitialTargetRef.current === initialTargetUid) return;

    const existingConv = conversations.find((c) => {
      const ids = getConversationParticipantIds(c);
      return ids.includes(initialTargetUid) && (currentUserRole !== 'super_admin' || ids.includes(currentUserUid));
    });
    if (existingConv) {
      handledInitialTargetRef.current = initialTargetUid;
      const peer = getConversationPeerDisplay(existingConv, currentUserUid);
      if (authorizedCategories.some((c) => c.role === peer.role)) {
        setSelectedCategory(peer.role);
      }
      setActiveConversation(existingConv);
      setMobileShowThread(true);
      return;
    }

    const matchedPeer = authorizedPeers.find((p) => p.uid === initialTargetUid);
    if (matchedPeer) {
      handledInitialTargetRef.current = initialTargetUid;
      openConversationWithPeer(matchedPeer);
    } else if (currentUserRole === 'super_admin' && initialTargetRole) {
      handledInitialTargetRef.current = initialTargetUid;
      openConversationWithPeer({
        uid: initialTargetUid,
        name: initialTargetName || initialTargetUid,
        role: initialTargetRole,
        relationshipType: 'admin_support',
      });
    }
  }, [initialTargetUid, loadingPeers, loadingConversations, authorizedPeers, conversations]);

  // 3. Subscribe to real-time messages for the active conversation
  const isActiveDirectMember = useMemo(() => {
    if (!activeConversation) return false;
    return getConversationParticipantIds(activeConversation).includes(currentUserUid);
  }, [activeConversation, currentUserUid]);

  const isPersistedConversation = useMemo(() => {
    if (!activeConversation?.id) return false;
    return serverConfirmedConvIds.has(activeConversation.id);
  }, [activeConversation?.id, serverConfirmedConvIds]);

  useEffect(() => {
    if (
      !activeConversation?.id ||
      !currentUserUid ||
      !authReadyUid ||
      authReadyUid !== currentUserUid ||
      !isPersistedConversation
    ) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    setErrorMsg(null);
    const convId = activeConversation.id;
    const msgQuery = query(
      collection(db, 'conversations', convId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(
      msgQuery,
      async (snapshot) => {
        const msgList: ChatMessage[] = snapshot.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
            } as ChatMessage)
        );

        setMessages(msgList);
        setLoadingMessages(false);

        // Remove any local outbox items now confirmed on Firestore server
        const confirmedIds = new Set(msgList.map((m) => m.id));
        setOutboxByConv((prev) => {
          const existing = prev[convId];
          if (!existing || existing.length === 0) return prev;
          const remaining = existing.filter((item) => !confirmedIds.has(item.id));
          if (remaining.length === existing.length) return prev;
          return { ...prev, [convId]: remaining };
        });

        // Only direct participants mark unread messages as read when online & authenticated
        if (
          isActiveDirectMember &&
          (typeof navigator === 'undefined' || navigator.onLine) &&
          auth.currentUser?.uid === currentUserUid
        ) {
          const unreadByMe = msgList.filter((m) => !m.read && m.senderId !== currentUserUid);
          if (unreadByMe.length > 0) {
            await Promise.allSettled(
              unreadByMe.map((m) =>
                updateDoc(doc(db, 'conversations', convId, 'messages', m.id), { read: true })
              )
            );

            try {
              const nextUnreadCounts = {
                ...(activeConversation.unreadCounts || {}),
                [currentUserUid]: 0,
              };
              const legacyReset: Record<string, any> = {};
              if (currentUserRole === 'doctor' && activeConversation.doctorId === currentUserUid) {
                legacyReset.unreadByDoctor = 0;
              }
              if (currentUserRole === 'patient' && activeConversation.patientId === currentUserUid) {
                legacyReset.unreadByPatient = 0;
              }
              await updateDoc(doc(db, 'conversations', convId), {
                unreadCounts: nextUnreadCounts,
                ...legacyReset,
                updatedAt: new Date().toISOString(),
              });
            } catch {}
          }
        }
      },
      (err) => {
        const classified = classifyMessagingError(err, typeof navigator !== 'undefined' ? navigator.onLine : true);
        console.error('Messages snapshot error:', err);
        setErrorMsg(language === 'ar' ? classified.messageAr : classified.messageEn);
        setLoadingMessages(false);
      }
    );

    return () => unsubscribe();
  }, [activeConversation?.id, currentUserUid, currentUserRole, authReadyUid, isPersistedConversation, isActiveDirectMember, language, snapshotEpoch]);

  const activePeer = useMemo(() => {
    if (!activeConversation) return null;
    return getConversationPeerDisplay(activeConversation, currentUserUid);
  }, [activeConversation, currentUserUid]);

  // Send message (text and/or attachment, or idempotent retry)
  const handleSendMessage = async (opts?: {
    attachment?: { url: string; name: string; mimeType: string };
    retryMessage?: LocalOutboxMessage;
  }) => {
    const attachment = opts?.attachment;
    const retryMessage = opts?.retryMessage;
    if (!activeConversation || !activePeer || sending) return;

    // Prevent accidental injection into third-party oversight view — require direct support thread
    if (currentUserRole === 'super_admin' && !isActiveDirectMember) {
      setErrorMsg(
        language === 'ar'
          ? 'وضع الإشراف للقراءة فقط. اختر أحد أزرار الدعم أعلاه لفتح محادثة دعم مباشر مع الطرف المعني.'
          : 'Oversight view is read-only. Use the Support Chat buttons above to message either participant directly.'
      );
      return;
    }

    const rawSourceText = retryMessage
      ? retryMessage.text
      : attachment
      ? messageText
      : messageText;
    const effectiveAttachment =
      attachment ||
      (retryMessage?.attachmentUrl
        ? {
            url: retryMessage.attachmentUrl,
            name: retryMessage.attachmentName || 'Attachment',
            mimeType: retryMessage.attachmentType || 'application/octet-stream',
          }
        : undefined);

    const validation = validateAndNormalizeMessageText(rawSourceText, Boolean(effectiveAttachment));
    if (!validation.valid) {
      setErrorMsg(language === 'ar' ? validation.errorAr || 'رسالة غير صالحة' : validation.errorEn || 'Invalid message');
      return;
    }

    const peerIsAuthorized =
      currentUserRole === 'super_admin' ||
      conversations.some((c) => c.id === activeConversation.id) ||
      authorizedPeers.some((p) => p.uid === activePeer.uid);

    const authCheck = canCommunicateWithPeer({
      senderRole: currentUserRole,
      senderUid: currentUserUid,
      targetRole: activePeer.role,
      targetUid: activePeer.uid,
      hasVerifiedRelationship: peerIsAuthorized,
    });

    if (!authCheck.allowed) {
      setErrorMsg(
        language === 'ar'
          ? 'غير مصرح بإرسال رسالة لهذا الحساب لعدم وجود ارتباط طبي أو اشتراك فعال.'
          : authCheck.reason || 'Unauthorized messaging peer'
      );
      return;
    }

    const convId = activeConversation.id;
    const finalText =
      validation.normalizedText ||
      (effectiveAttachment ? (language === 'ar' ? 'ملف مرفق' : 'Attachment') : '');

    // Reuse msgId on retry OR when resending the exact same failed draft for idempotency
    const reusedFailedDraftId =
      !retryMessage &&
      !effectiveAttachment &&
      lastFailedDraftRef.current?.convId === convId &&
      lastFailedDraftRef.current?.text === finalText
        ? lastFailedDraftRef.current.msgId
        : null;

    const msgId = retryMessage?.id || reusedFailedDraftId || createClientMessageId();
    const now = new Date().toISOString();

    const newMsg: ChatMessage = {
      id: msgId,
      conversationId: convId,
      senderId: currentUserUid,
      senderName: currentUserName,
      senderRole: currentUserRole,
      text: finalText,
      attachmentUrl: effectiveAttachment?.url,
      attachmentName: effectiveAttachment?.name,
      attachmentType: effectiveAttachment?.mimeType,
      timestamp: retryMessage?.timestamp || now,
      read: false,
    };

    const upsertOutboxItem = (item: LocalOutboxMessage) => {
      setOutboxByConv((prev) => {
        const list = prev[convId] || [];
        const filtered = list.filter((m) => m.id !== item.id);
        return { ...prev, [convId]: [...filtered, item] };
      });
    };

    const removeOutboxItem = (targetId: string) => {
      setOutboxByConv((prev) => {
        const list = prev[convId];
        if (!list) return prev;
        return { ...prev, [convId]: list.filter((m) => m.id !== targetId) };
      });
    };

    setSending(true);
    setErrorMsg(null);
    setSendStatusNotice(null);

    upsertOutboxItem({
      ...newMsg,
      deliveryState: 'sending',
    });

    let currentOpType: OperationType = OperationType.WRITE;
    let currentOpPath = `conversations/${convId}`;

    try {
      // 1. Verify active authenticated session & token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || firebaseUser.uid !== currentUserUid) {
        const sessionErr = new Error('session_expired: Active Firebase session does not match signed-in account.');
        (sessionErr as any).code = 'unauthenticated';
        throw sessionErr;
      }

      // 2. Pre-flight offline detection (never allow offline Firestore write to hang or fake success)
      const currentlyOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (!currentlyOnline) {
        const offlineErr = new Error('network_offline: Browser is offline.');
        (offlineErr as any).code = 'offline';
        throw offlineErr;
      }

      await runWithNetworkTimeout(firebaseUser.getIdToken(), 10000).catch((tokenErr) => {
        const errCode = String((tokenErr as any)?.code || '').toLowerCase();
        if (errCode.includes('network') || errCode.includes('timeout')) {
          throw tokenErr;
        }
        const authErr = new Error('unauthenticated: Could not verify Firebase ID token.');
        (authErr as any).code = 'unauthenticated';
        throw authErr;
      });

      const convRef = doc(db, 'conversations', convId);
      const isExistingConversation = conversations.some((c) => c.id === convId);
      const rawParticipantIds = getConversationParticipantIds(activeConversation);
      const deduplicatedIds = Array.from(new Set(rawParticipantIds.filter(Boolean)));
      const safeParticipantIds =
        deduplicatedIds.length === 2 &&
        deduplicatedIds.includes(currentUserUid) &&
        deduplicatedIds.includes(activePeer.uid)
          ? deduplicatedIds
          : [currentUserUid, activePeer.uid].sort();

      const prevUnreadCounts = activeConversation.unreadCounts || {};
      const nextUnreadCounts: Record<string, number> = {
        ...prevUnreadCounts,
        [currentUserUid]: 0,
        [activePeer.uid]: (prevUnreadCounts[activePeer.uid] || 0) + 1,
      };

      const participantsMap = {
        ...(activeConversation.participants || {}),
        [currentUserUid]: {
          uid: currentUserUid,
          role: currentUserRole,
          name: currentUserName,
        },
        [activePeer.uid]: {
          ...(activeConversation.participants?.[activePeer.uid] || {}),
          uid: activePeer.uid,
          role: activePeer.role,
          name: activePeer.name,
          specialtyOrFacility:
            activeConversation.participants?.[activePeer.uid]?.specialtyOrFacility || activePeer.subtitle,
        },
      };

      const updatedConv: Conversation = {
        ...activeConversation,
        id: convId,
        participantIds: safeParticipantIds,
        participants: participantsMap,
        relationshipType:
          activeConversation.relationshipType || authCheck.relationshipType || 'doctor_patient',
        unreadCounts: nextUnreadCounts,
        lastMessageText: newMsg.text.slice(0, 200),
        lastMessageTimestamp: now,
        lastSenderUid: currentUserUid,
        unreadByDoctor:
          activePeer.role === 'doctor' ? (activeConversation.unreadByDoctor || 0) + 1 : 0,
        unreadByPatient:
          activePeer.role === 'patient' ? (activeConversation.unreadByPatient || 0) + 1 : 0,
        updatedAt: now,
      };

      currentOpType = isExistingConversation ? OperationType.UPDATE : OperationType.CREATE;
      currentOpPath = `conversations/${convId}`;
      await runWithNetworkTimeout(
        setDoc(convRef, sanitizeForFirestore(updatedConv), { merge: true }),
        15000
      );
      setServerConfirmedConvIds((prev) => {
        if (prev.has(convId)) return prev;
        const next = new Set(prev);
        next.add(convId);
        return next;
      });

      currentOpType = OperationType.CREATE;
      currentOpPath = `conversations/${convId}/messages/${msgId}`;
      await runWithNetworkTimeout(
        setDoc(doc(db, 'conversations', convId, 'messages', msgId), sanitizeForFirestore(newMsg)),
        15000
      );

      // Confirmed saved in Firestore — ONLY now clear draft/outbox and show success
      removeOutboxItem(msgId);
      if (lastFailedDraftRef.current?.msgId === msgId) {
        lastFailedDraftRef.current = null;
      }
      setActiveConversation(updatedConv);
      if (!retryMessage) {
        setMessageText('');
      }
      setSendStatusNotice({
        type: 'success',
        text: language === 'ar' ? 'تم إرسال وحفظ الرسالة بنجاح' : 'Message sent and saved',
      });
      setTimeout(() => {
        setSendStatusNotice((curr) => (curr?.type === 'success' ? null : curr));
      }, 3000);

      if (currentUserRole === 'super_admin') {
        auditSuperAdminOversightAction(
          updatedConv,
          'super_admin_support_message_sent',
          `Super Admin sent support message to ${activePeer.name} (${activePeer.role})`
        );
      }

      const targetPortal = roleToPortalId(activePeer.role);
      dispatchM737Notification({
        recipientUid: activePeer.uid,
        recipientRole: activePeer.role,
        category: 'general',
        titleAr: `رسالة خاصة جديدة من ${currentUserName}`,
        titleEn: `New private message from ${currentUserName}`,
        messageAr: newMsg.text.slice(0, 100),
        messageEn: newMsg.text.slice(0, 100),
        targetPortal,
        targetUrl: `/${targetPortal}`,
        priority: 'urgent',
      }).catch((e) => console.warn('Push dispatch notice:', e));
    } catch (err: unknown) {
      console.error('Error sending chat message:', err);
      const currentlyOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
      const classified = classifyMessagingError(err, currentlyOnline);
      const localizedReason = language === 'ar' ? classified.messageAr : classified.messageEn;

      // Preserve failed message & keep messageText intact in the input!
      upsertOutboxItem({
        ...newMsg,
        deliveryState: 'failed',
        errorCode: classified.code,
        errorMessage: localizedReason,
        retryable: classified.retryable,
      });

      if (!retryMessage && !effectiveAttachment) {
        lastFailedDraftRef.current = { convId, text: finalText, msgId };
      }

      setErrorMsg(localizedReason);
      setSendStatusNotice({ type: 'error', text: localizedReason });

      if (classified.code === 'permission-denied') {
        handleFirestoreError(err, currentOpType, currentOpPath);
      }
    } finally {
      setSending(false);
    }
  };

  // Upload attachment (Firebase Storage Rules verify membership against /conversations/{convId})
  const performAttachmentUpload = async (file: File) => {
    if (!activeConversation || !activePeer || uploadingAttachment) return;
    if (currentUserRole === 'super_admin' && !isActiveDirectMember) {
      setErrorMsg(
        language === 'ar'
          ? 'وضع الإشراف للقراءة فقط. افتح محادثة دعم مباشر لإرسال مرفقات.'
          : 'Oversight view is read-only. Open a direct support thread to attach files.'
      );
      return;
    }

    if (!auth.currentUser || auth.currentUser.uid !== currentUserUid) {
      setErrorMsg(
        language === 'ar'
          ? 'انتهت جلسة المصادقة. يرجى تسجيل الدخول مرة أخرى لإرسال المرفق.'
          : 'Authentication session expired. Please sign in again to send attachments.'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFailedAttachmentFile({ convId: activeConversation.id, file });
      setErrorMsg(
        language === 'ar'
          ? 'لا يوجد اتصال بالإنترنت لرفع المرفق. تم الاحتفاظ بالملف لإعادة المحاولة فور عودة الاتصال.'
          : 'Offline: attachment preserved so you can retry once connection returns.'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingAttachment(true);
    setFailedAttachmentFile(null);
    setErrorMsg(null);
    setAttachmentUploadInfo({
      status: 'preparing',
      percent: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      bytesPerSecond: 0,
      speedFormatted: '0 KB/s',
      etaSeconds: null,
      elapsedMs: 0,
      attempt: 1,
    });

    const isExistingConversation = conversations.some((c) => c.id === activeConversation.id);
    const convOpType = isExistingConversation ? OperationType.UPDATE : OperationType.CREATE;
    const convOpPath = `conversations/${activeConversation.id}`;
    let convWritePhase = false;
    try {
      const now = new Date().toISOString();
      const participantIds = getConversationParticipantIds(activeConversation);
      const safeParticipantIds =
        participantIds.length >= 2 ? participantIds : [currentUserUid, activePeer.uid].sort();

      convWritePhase = true;
      await runWithNetworkTimeout(
        setDoc(
          doc(db, 'conversations', activeConversation.id),
          sanitizeForFirestore({
            ...activeConversation,
            participantIds: safeParticipantIds,
            updatedAt: now,
          }),
          { merge: true }
        ),
        15000
      );
      setServerConfirmedConvIds((prev) => {
        if (prev.has(activeConversation.id)) return prev;
        const next = new Set(prev);
        next.add(activeConversation.id);
        return next;
      });
      convWritePhase = false;

      const uploaded = await uploadChatAttachmentFile(file, activeConversation.id, currentUserUid, {
        onProgress: (info) => setAttachmentUploadInfo(info),
        onCancelHandle: (cancelFn) => {
          attachmentCancelRef.current = cancelFn;
        },
      });
      attachmentCancelRef.current = null;
      await handleSendMessage({ attachment: uploaded });
      setAttachmentUploadInfo(null);
    } catch (err: unknown) {
      attachmentCancelRef.current = null;
      console.error('Attachment upload failed:', err);
      const classified = classifyMessagingError(err, typeof navigator !== 'undefined' ? navigator.onLine : true);
      setFailedAttachmentFile({ convId: activeConversation.id, file });
      setAttachmentUploadInfo((prev) => (prev ? { ...prev, status: 'failed' } : null));
      setErrorMsg(
        (err instanceof Error && err.message) ||
          (language === 'ar' ? classified.messageAr : classified.messageEn)
      );
      if (convWritePhase && classified.code === 'permission-denied') {
        handleFirestoreError(err, convOpType, convOpPath);
      }
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await performAttachmentUpload(file);
  };

  const renderRoleIcon = (role: UserRole, size = 17) => {
    switch (role) {
      case 'doctor':
        return <Stethoscope size={size} className="text-red-600" />;
      case 'laboratory':
        return <FlaskConical size={size} className="text-orange-600" />;
      case 'radiology_center':
        return <Scan size={size} className="text-cyan-600" />;
      case 'pharmacy':
        return <Pill size={size} className="text-emerald-600" />;
      case 'wholesaler':
        return <Building2 size={size} className="text-teal-600" />;
      case 'super_admin':
        return <ShieldCheck size={size} className="text-indigo-700" />;
      default:
        return <User size={size} className="text-[#003366]" />;
    }
  };

  const getRoleLabel = (role: UserRole) => {
    const mapAr: Record<string, string> = {
      patient: 'مريض / مراجع',
      doctor: 'طبيب',
      laboratory: 'مختبر تحاليل',
      pharmacy: 'صيدلية',
      wholesaler: 'مذخر أدوية',
      super_admin: 'الإدارة العليا',
      secretary: 'سكرتارية',
      radiology_center: 'مركز أشعة',
    };
    const mapEn: Record<string, string> = {
      patient: 'Patient',
      doctor: 'Doctor',
      laboratory: 'Laboratory',
      pharmacy: 'Pharmacy',
      wholesaler: 'Medical Warehouse',
      super_admin: 'Super Admin',
      secretary: 'Secretary',
      radiology_center: 'Radiology Center',
    };
    return language === 'ar' ? mapAr[role] || role : mapEn[role] || role;
  };

  // Match conversation against a selected role category
  const doesConversationMatchCategory = (conv: Conversation, categoryRole: UserRole): boolean => {
    if (isRoleSuspended(categoryRole) && currentUserRole !== 'super_admin') return false;
    if (currentUserRole === 'super_admin') {
      const participants = getConversationParticipantsList(conv);
      return participants.some((p) => p.role === categoryRole);
    }
    const peer = getConversationPeerDisplay(conv, currentUserUid);
    if (isRoleSuspended(peer.role)) return false;
    return peer.role === categoryRole;
  };

  // Category metrics (conversations, unread, linked peers)
  const getCategoryStats = (cat: MessagingCategoryDescriptor) => {
    const catConvs = conversations.filter((c) => doesConversationMatchCategory(c, cat.role));
    const unread = catConvs.reduce(
      (sum, c) => sum + getUnreadCountForUser(c, currentUserUid, currentUserRole),
      0
    );
    const peerCount = authorizedPeers.filter((p) => p.role === cat.role).length;
    return { convCount: catConvs.length, unread, peerCount };
  };

  const categoryConversations = useMemo(() => {
    if (!selectedCategory) return [];
    return conversations.filter((c) => {
      if (!doesConversationMatchCategory(c, selectedCategory)) return false;

      if (currentUserRole === 'super_admin') {
        const isDirectSupport = getConversationParticipantIds(c).includes(currentUserUid);
        if (adminOversightFilter === 'support' && !isDirectSupport) return false;
        if (
          adminOversightFilter === 'attachments' &&
          !String(c.lastMessageText || '').includes('مرفق') &&
          !String(c.lastMessageText || '').toLowerCase().includes('attachment')
        ) {
          // Also keep conversations with attachment keywords or relationship logs visible
          const hasAttachmentText =
            (c.lastMessageText || '').includes('ملف') ||
            (c.lastMessageText || '').toLowerCase().includes('.pdf') ||
            (c.lastMessageText || '').toLowerCase().includes('.jpg') ||
            (c.lastMessageText || '').toLowerCase().includes('.png') ||
            (c.lastMessageText || '').toLowerCase().includes('.dcm');
          if (!hasAttachmentText) return false;
        }
      }

      const participantsText = getConversationParticipantsList(c)
        .map((p) => `${p.name} ${p.subtitle || ''}`)
        .join(' ')
        .toLowerCase();
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        participantsText.includes(q) ||
        (c.lastMessageText || '').toLowerCase().includes(q)
      );
    });
  }, [conversations, selectedCategory, searchQuery, currentUserRole, adminOversightFilter, currentUserUid]);

  const categoryPeers = useMemo(() => {
    if (!selectedCategory) return [];
    const q = searchQuery.trim().toLowerCase();
    return authorizedPeers.filter((p) => {
      if (p.role !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.accountId || '').toLowerCase().includes(q) ||
        (p.subtitle || '').toLowerCase().includes(q)
      );
    });
  }, [authorizedPeers, selectedCategory, searchQuery]);

  const activeCategoryMeta = useMemo(
    () => authorizedCategories.find((c) => c.role === selectedCategory) || null,
    [authorizedCategories, selectedCategory]
  );

  const activeConversationParticipants = useMemo(
    () => (activeConversation ? getConversationParticipantsList(activeConversation) : []),
    [activeConversation]
  );

  return (
    <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col md:flex-row h-[78vh] min-h-[600px]">
      {/* Sidebar: Step 1 (Categories) -> Step 2 (Category Conversations & Peers) */}
      <div
        className={`w-full md:w-84 lg:w-96 border-b md:border-b-0 md:border-e border-slate-200 flex-col bg-slate-50/70 shrink-0 ${
          mobileShowThread ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#003366] text-white flex items-center justify-center shadow-xs shrink-0">
              <MessageSquare size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-900 truncate">
                {language === 'ar' ? 'المراسلة المصنّفة المؤمّنة' : 'Categorized Secure Messaging'}
              </h3>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                {currentUserRole === 'super_admin' ? (
                  <>
                    <ShieldCheck
                      size={11}
                      className={adminOversightVerified ? 'text-emerald-600 shrink-0' : 'text-amber-600 shrink-0'}
                    />
                    <span>
                      {adminOversightVerified
                        ? language === 'ar'
                          ? 'إشراف الإدارة العليا موثق'
                          : 'Verified Super Admin Oversight'
                        : adminOversightStatus === 'verifying'
                        ? language === 'ar'
                          ? 'جارٍ توثيق صلاحية الإشراف...'
                          : 'Verifying oversight...'
                        : language === 'ar'
                        ? 'وضع الدعم المباشر'
                        : 'Support Access'}
                    </span>
                  </>
                ) : (
                  <>
                    <Lock size={10} className="text-emerald-600 shrink-0" />
                    <span>
                      {language === 'ar'
                        ? 'مقسمة حسب الفئات والعلاقات المعتمدة'
                        : 'Categorized & scoped by relationship'}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* STEP 1: Category Selector Grid */}
        {!selectedCategory ? (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            <div className="px-1 flex items-center justify-between text-[11px] font-bold text-slate-600">
              <span>
                {language === 'ar' ? 'الخطوة ١: اختر فئة التواصل' : 'Step 1: Choose Recipient Category'}
              </span>
              <span className="font-mono text-slate-400">{authorizedCategories.length}</span>
            </div>

            <div className="space-y-2.5">
              {authorizedCategories.map((cat) => {
                const stats = getCategoryStats(cat);
                return (
                  <button
                    key={cat.role}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.role);
                      setShowContactsSubtab('threads');
                      setSearchQuery('');
                    }}
                    className="w-full p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-[#003366] hover:shadow-sm transition-all text-start cursor-pointer flex items-center gap-3 group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-slate-200/70 flex items-center justify-center shrink-0">
                      {renderRoleIcon(cat.role, 20)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                          {language === 'ar' ? cat.labelAr : cat.labelEn}
                        </span>
                        {stats.unread > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold shrink-0">
                            {stats.unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {language === 'ar' ? cat.descAr : cat.descEn}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] font-bold text-slate-500">
                        <span className="text-[#003366]">
                          {stats.convCount} {language === 'ar' ? 'محادثة' : 'chats'}
                        </span>
                        <span>·</span>
                        <span className="text-emerald-700">
                          {stats.peerCount} {language === 'ar' ? 'جهة مرتبطة' : 'linked contacts'}
                        </span>
                      </div>
                    </div>

                    {isRTL ? (
                      <ChevronLeft size={16} className="text-slate-400 group-hover:text-[#003366] shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-slate-400 group-hover:text-[#003366] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* STEP 2: Conversations & Linked Contacts inside Selected Category */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Step 2 Category Breadcrumb & Back */}
            <div className="p-3 border-b border-slate-200 bg-white space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    setSearchQuery('');
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  {isRTL ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                  <span>{language === 'ar' ? 'الفئات' : 'Categories'}</span>
                </button>

                <div className="flex items-center gap-1.5 font-bold text-xs text-[#003366] truncate">
                  {renderRoleIcon(selectedCategory, 15)}
                  <span className="truncate">
                    {activeCategoryMeta
                      ? language === 'ar'
                        ? activeCategoryMeta.labelAr
                        : activeCategoryMeta.labelEn
                      : getRoleLabel(selectedCategory)}
                  </span>
                </div>
              </div>

              {/* Quick Sub-tabs: Active Threads vs Start New Chat in Category */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setShowContactsSubtab('threads')}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                    showContactsSubtab === 'threads'
                      ? 'bg-white text-[#003366] shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {language === 'ar'
                    ? `المحادثات (${categoryConversations.length})`
                    : `Threads (${categoryConversations.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowContactsSubtab('contacts')}
                  className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    showContactsSubtab === 'contacts'
                      ? 'bg-white text-[#003366] shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Plus size={12} />
                  <span>
                    {language === 'ar'
                      ? `جهات الفئة (${categoryPeers.length})`
                      : `Contacts (${categoryPeers.length})`}
                  </span>
                </button>
              </div>

              {/* Super Admin Oversight Filters inside Category */}
              {currentUserRole === 'super_admin' && showContactsSubtab === 'threads' && (
                <div className="flex items-center gap-1 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setAdminOversightFilter('all')}
                    className={`px-2 py-1 rounded-lg cursor-pointer ${
                      adminOversightFilter === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {language === 'ar' ? 'الكل (إشراف)' : 'All (Oversight)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminOversightFilter('support')}
                    className={`px-2 py-1 rounded-lg cursor-pointer ${
                      adminOversightFilter === 'support'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {language === 'ar' ? 'دعم مباشر' : 'Direct Support'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminOversightFilter('attachments')}
                    className={`px-2 py-1 rounded-lg cursor-pointer ${
                      adminOversightFilter === 'attachments'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {language === 'ar' ? 'بمرفقات' : 'Attachments'}
                  </button>
                </div>
              )}

              {/* Search within selected Category */}
              <div className="relative">
                <Search size={14} className="absolute inset-y-0 start-3 my-auto text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    language === 'ar' ? 'بحث بالاسم أو محتوى الرسالة...' : 'Search name or message...'
                  }
                  className="w-full ps-8 pe-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#003366] bg-slate-50"
                />
              </div>
            </div>

            {/* List Content inside Selected Category */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {showContactsSubtab === 'contacts' ? (
                loadingPeers ? (
                  <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <RefreshCw size={20} className="animate-spin text-[#003366]" />
                    <span>{language === 'ar' ? 'جارٍ تحميل جهات الفئة...' : 'Loading category contacts...'}</span>
                  </div>
                ) : categoryPeers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                    <Lock size={24} className="mx-auto text-slate-300" />
                    <p className="font-bold text-slate-700">
                      {language === 'ar'
                        ? 'لا توجد جهات مرتبطة ضمن هذه الفئة حالياً'
                        : 'No authorized contacts in this category'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {currentUserRole === 'patient'
                        ? language === 'ar'
                          ? 'تظهر هنا الجهات التي لديك معها حجز، طلب، أو وصفة طبية فقط.'
                          : 'Only institutions linked via a booking, order, or prescription appear here.'
                        : language === 'ar'
                        ? 'تظهر هنا الحسابات المرتبطة بمنشأتك ضمن هذه الفئة فقط.'
                        : 'Only accounts linked with your facility appear in this category.'}
                    </p>
                  </div>
                ) : (
                  categoryPeers.map((peer) => (
                    <button
                      key={`${peer.relationshipType}_${peer.uid}`}
                      type="button"
                      onClick={() => openConversationWithPeer(peer)}
                      className="w-full p-3.5 text-start hover:bg-white transition-all cursor-pointer flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-200/80 flex items-center justify-center shrink-0">
                        {renderRoleIcon(peer.role)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">{peer.name}</div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px]">
                            {getRoleLabel(peer.role)}
                          </span>
                          {peer.subtitle && <span className="truncate">{peer.subtitle}</span>}
                        </div>
                      </div>
                    </button>
                  ))
                )
              ) : loadingConversations ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw size={20} className="animate-spin text-[#003366]" />
                  <span>{language === 'ar' ? 'جارٍ تحميل المحادثات...' : 'Loading chats...'}</span>
                </div>
              ) : categoryConversations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                  <FolderOpen size={26} className="mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-600">
                    {language === 'ar'
                      ? 'لا توجد محادثات ضمن هذه الفئة حتى الآن.'
                      : 'No conversations in this category yet.'}
                  </p>
                  {categoryPeers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowContactsSubtab('contacts')}
                      className="px-3.5 py-2 rounded-xl bg-[#003366] text-white text-xs font-bold hover:bg-[#002244] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      <span>{language === 'ar' ? 'بدء محادثة جديدة بالفئة' : 'Start Chat in Category'}</span>
                    </button>
                  )}
                </div>
              ) : (
                categoryConversations.map((conv) => {
                  const isSelected = activeConversation?.id === conv.id;
                  const peer = getConversationPeerDisplay(conv, currentUserUid);
                  const unreadCount = getUnreadCountForUser(conv, currentUserUid, currentUserRole);
                  const isOversightThread =
                    currentUserRole === 'super_admin' &&
                    !getConversationParticipantIds(conv).includes(currentUserUid);
                  const participants = isOversightThread ? getConversationParticipantsList(conv) : null;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => handleSelectConversation(conv)}
                      className={`w-full p-3.5 text-start transition-all cursor-pointer flex items-start gap-3 ${
                        isSelected
                          ? 'bg-white shadow-xs border-s-4 border-[#003366]'
                          : 'hover:bg-white/80'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-200/80 text-slate-700 flex items-center justify-center shrink-0 font-bold text-xs">
                        {isOversightThread ? (
                          <Eye size={17} className="text-indigo-700" />
                        ) : (
                          renderRoleIcon(peer.role)
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {isOversightThread && participants
                              ? participants.map((p) => p.name).join(' ↔ ')
                              : peer.name}
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {conv.lastMessageTimestamp
                              ? new Date(conv.lastMessageTimestamp).toLocaleTimeString(
                                  language === 'ar' ? 'ar-IQ' : 'en-US',
                                  { hour: '2-digit', minute: '2-digit' }
                                )
                              : ''}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <span>
                            {isOversightThread
                              ? `${language === 'ar' ? 'إشراف' : 'Oversight'} · ${conv.relationshipType}`
                              : getRoleLabel(peer.role)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {conv.lastMessageText || (language === 'ar' ? 'محادثة جديدة' : 'New conversation')}
                        </p>
                      </div>

                      {unreadCount > 0 && !isOversightThread && (
                        <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Chat Panel */}
      <div
        className={`flex-1 flex-col bg-white overflow-hidden ${
          mobileShowThread ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeConversation && activePeer ? (
          <>
            {/* Chat Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between shadow-xs gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowThread(false)}
                  className="md:hidden p-1.5 rounded-lg bg-slate-100 text-slate-700 cursor-pointer"
                >
                  {isRTL ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                </button>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#003366] flex items-center justify-center font-bold shrink-0">
                  {currentUserRole === 'super_admin' && !isActiveDirectMember ? (
                    <ShieldCheck size={18} className="text-indigo-700" />
                  ) : (
                    renderRoleIcon(activePeer.role)
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-slate-900 truncate">
                    {currentUserRole === 'super_admin' && !isActiveDirectMember
                      ? activeConversationParticipants.map((p) => p.name).join(' ↔ ')
                      : activePeer.name}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>
                      {currentUserRole === 'super_admin' && !isActiveDirectMember
                        ? `${language === 'ar' ? 'مراقبة الإدارة العليا' : 'Super Admin Oversight'} (${activeConversation.relationshipType})`
                        : getRoleLabel(activePeer.role)}
                    </span>
                    {activePeer.subtitle && isActiveDirectMember && (
                      <span className="hidden sm:inline truncate">• {activePeer.subtitle}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Super Admin Quick Direct-Support Launchers for Oversight Threads */}
              {currentUserRole === 'super_admin' && !isActiveDirectMember && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeConversationParticipants.map((participant) => (
                    <button
                      key={participant.uid}
                      type="button"
                      onClick={() =>
                        openConversationWithPeer({
                          uid: participant.uid,
                          name: participant.name,
                          role: participant.role,
                          relationshipType: 'admin_support',
                          subtitle: participant.subtitle,
                        })
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <MessageSquare size={12} />
                      <span>
                        {language === 'ar'
                          ? `دعم: ${participant.name}`
                          : `Support: ${participant.name}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {currentUserRole === 'super_admin' && !isActiveDirectMember && (
              <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 text-[11px] text-indigo-900 flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5">
                  <Eye size={13} className="text-indigo-700" />
                  <span>
                    {language === 'ar'
                      ? 'وضع الرقابة الإدارية (للقراءة والتدقيق فقط) — مسجل في سجل التدقيق الأمني'
                      : 'Administrative Oversight Mode (Read & Audit Only) — Logged to Security Audit Trail'}
                  </span>
                </span>
                <span className="font-mono text-indigo-700">
                  {messages.filter((m) => Boolean(m.attachmentUrl)).length}{' '}
                  {language === 'ar' ? 'مرفقات' : 'attachments'}
                </span>
              </div>
            )}

            {/* Connectivity / Conversations Subscription Error Banner */}
            {!isOnline && (
              <div className="px-4 py-2 bg-amber-50 text-amber-900 text-xs border-b border-amber-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <WifiOff size={15} className="shrink-0 text-amber-600" />
                  <span>
                    {language === 'ar'
                      ? 'وضع عدم الاتصال — لن يتم فقدان نصك عند فشل الإرسال.'
                      : 'Offline — typed drafts and failed messages stay preserved for retry.'}
                  </span>
                </div>
              </div>
            )}

            {(errorMsg || conversationsError) && (
              <div className="p-2.5 bg-red-50 text-red-800 text-xs border-b border-red-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <AlertCircle size={15} className="shrink-0 text-red-600" />
                  <span className="break-words">{errorMsg || conversationsError}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {errorMsg && messageText.trim().length > 0 && (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => handleSendMessage().catch(() => {})}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw size={12} />
                      <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                    </button>
                  )}
                  {conversationsError && (
                    <button
                      type="button"
                      onClick={() => setSnapshotEpoch((n) => n + 1)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-100 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={12} />
                      <span>{language === 'ar' ? 'تحديث الاتصال' : 'Reconnect'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {sendStatusNotice?.type === 'success' && (
              <div className="px-4 py-1.5 bg-emerald-50 text-emerald-800 text-[11px] font-bold border-b border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span>{sendStatusNotice.text}</span>
              </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {loadingMessages && renderedMessages.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw size={20} className="animate-spin text-[#003366]" />
                  <span>{language === 'ar' ? 'جارٍ تحميل الرسائل...' : 'Loading messages...'}</span>
                </div>
              ) : renderedMessages.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto text-[#003366]">
                    <MessageSquare size={22} />
                  </div>
                  <p className="font-bold text-slate-700">
                    {language === 'ar' ? 'بداية المحادثة الخاصة الآمنة' : 'Private authorized thread started'}
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    {language === 'ar'
                      ? 'جميع الرسائل والمرفقات محمية بقواعد الأمان ومقتصرة على طرفي المحادثة المصرح لهما فقط.'
                      : 'All messages and attachments are protected by security rules and accessible only to authorized participants.'}
                  </p>
                </div>
              ) : (
                renderedMessages.map((m) => {
                  const isMine = m.senderId === currentUserUid;
                  const isFailed = m.deliveryState === 'failed';
                  const isSendingItem = m.deliveryState === 'sending';

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} animate-in fade-in`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                          isFailed
                            ? 'bg-red-50 text-red-950 border-2 border-red-300 rounded-ee-xs shadow-xs'
                            : isMine
                            ? 'bg-[#003366] text-white rounded-ee-xs shadow-xs'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-es-xs shadow-xs'
                        }`}
                      >
                        {!isMine && (
                          <div className="text-[10px] font-bold text-slate-500 mb-1">
                            {m.senderName} ({getRoleLabel(m.senderRole)})
                          </div>
                        )}

                        <p dir="auto" className="whitespace-pre-wrap break-words">{m.text}</p>

                        {m.attachmentUrl && (
                          <div className="mt-2 space-y-2">
                            {m.attachmentType?.startsWith('image/') && (
                              <a href={m.attachmentUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={m.attachmentUrl}
                                  alt={m.attachmentName || 'Attachment'}
                                  className="max-h-48 rounded-xl border border-white/20 object-contain bg-black/5"
                                />
                              </a>
                            )}
                            <div
                              className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                                isMine && !isFailed
                                  ? 'bg-white/10 border-white/20 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-900'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText size={18} className="shrink-0" />
                                <span className="text-xs truncate font-medium">
                                  {m.attachmentName || 'Attachment'}
                                </span>
                              </div>
                              <a
                                href={m.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                                  isMine && !isFailed
                                    ? 'hover:bg-white/20 text-white'
                                    : 'hover:bg-slate-200 text-[#003366]'
                                }`}
                                title={language === 'ar' ? 'تحميل أو فتح الملف' : 'Download file'}
                              >
                                <Download size={15} />
                              </a>
                            </div>
                          </div>
                        )}

                        <div
                          className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] ${
                            isFailed ? 'text-red-700' : isMine ? 'text-white/70' : 'text-slate-400'
                          }`}
                        >
                          <span>
                            {new Date(m.timestamp).toLocaleTimeString(
                              language === 'ar' ? 'ar-IQ' : 'en-US',
                              { hour: '2-digit', minute: '2-digit' }
                            )}
                          </span>
                          {isMine &&
                            (isSendingItem ? (
                              <span className="inline-flex items-center gap-1">
                                <RefreshCw size={10} className="animate-spin" />
                                <span>{language === 'ar' ? 'جارٍ الإرسال' : 'Sending'}</span>
                              </span>
                            ) : isFailed ? (
                              <span className="inline-flex items-center gap-1 font-bold">
                                <AlertCircle size={11} />
                                <span>{language === 'ar' ? 'فشل الإرسال' : 'Failed'}</span>
                              </span>
                            ) : m.read ? (
                              <CheckCheck size={13} className="text-emerald-300" />
                            ) : (
                              <Check size={12} className="text-white/80" />
                            ))}
                        </div>

                        {isFailed && (
                          <div className="mt-2 pt-2 border-t border-red-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <span className="text-red-800">{m.errorMessage}</span>
                            <div className="flex items-center gap-1.5">
                              {m.retryable !== false && (
                                <button
                                  type="button"
                                  disabled={sending}
                                  onClick={() =>
                                    handleSendMessage({
                                      retryMessage: m as LocalOutboxMessage,
                                    }).catch(() => {})
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <RotateCcw size={11} />
                                  <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  if (m.text && !messageText.trim()) {
                                    setMessageText(m.text);
                                  }
                                  setOutboxByConv((prev) => ({
                                    ...prev,
                                    [activeConversation.id]: (prev[activeConversation.id] || []).filter(
                                      (item) => item.id !== m.id
                                    ),
                                  }));
                                }}
                                className="px-2 py-1 rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-100 font-semibold cursor-pointer"
                              >
                                {language === 'ar' ? 'إزالة' : 'Dismiss'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar (Hidden or disabled when Super Admin is in read-only oversight view) */}
            {!(currentUserRole === 'super_admin' && !isActiveDirectMember) && (
              <div className="p-3 border-t border-slate-200 bg-white space-y-1.5">
                {/* Real Upload Progress & Retry Banner for Chat Attachments */}
                {uploadingAttachment && attachmentUploadInfo && (
                  <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-bold text-[#003366]">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw size={12} className="animate-spin" />
                        <span>
                          {language === 'ar'
                            ? `جارٍ رفع المرفق (${formatBytesCompact(attachmentUploadInfo.bytesTransferred)} / ${formatBytesCompact(attachmentUploadInfo.totalBytes)})`
                            : `Uploading attachment (${formatBytesCompact(attachmentUploadInfo.bytesTransferred)} / ${formatBytesCompact(attachmentUploadInfo.totalBytes)})`}
                        </span>
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        {attachmentUploadInfo.bytesPerSecond > 0 && (
                          <span>{attachmentUploadInfo.speedFormatted}</span>
                        )}
                        <span>{attachmentUploadInfo.percent}%</span>
                        <button
                          type="button"
                          onClick={() => attachmentCancelRef.current?.()}
                          className="px-2 py-0.5 rounded bg-white border border-sky-300 text-rose-700 font-sans cursor-pointer"
                        >
                          {language === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-sky-200 overflow-hidden">
                      <div
                        className="h-full bg-[#003366] transition-all duration-150"
                        style={{ width: `${attachmentUploadInfo.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {!uploadingAttachment &&
                  failedAttachmentFile &&
                  failedAttachmentFile.convId === activeConversation?.id && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] flex items-center justify-between gap-2">
                      <span className="font-bold text-rose-800 truncate">
                        {language === 'ar'
                          ? `تعذر رفع الملف: ${failedAttachmentFile.file.name}`
                          : `Failed: ${failedAttachmentFile.file.name}`}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void performAttachmentUpload(failedAttachmentFile.file)}
                          className="px-2.5 py-1 rounded-lg bg-[#003366] text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw size={11} />
                          <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFailedAttachmentFile(null)}
                          className="p-1 text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage().catch(() => {});
                  }}
                  className="flex items-end gap-2"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAttachmentUpload}
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.dcm,.dicom"
                  />

                  <button
                    type="button"
                    disabled={uploadingAttachment || sending}
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                    title={language === 'ar' ? 'إرفاق ملف أو صورة' : 'Attach file or image'}
                  >
                    {uploadingAttachment ? (
                      <RefreshCw size={17} className="animate-spin text-[#003366]" />
                    ) : (
                      <Paperclip size={17} />
                    )}
                  </button>

                  <textarea
                    ref={textareaRef}
                    rows={1}
                    dir="auto"
                    inputMode="text"
                    enterKeyHint="enter"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      const isMobileViewport =
                        typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        !isMobileViewport &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        if (!sending && !uploadingAttachment && validateAndNormalizeMessageText(messageText, false).valid) {
                          handleSendMessage().catch(() => {});
                        }
                      }
                    }}
                    placeholder={
                      uploadingAttachment
                        ? language === 'ar'
                          ? 'جارٍ رفع الملف المرفق...'
                          : 'Uploading attachment...'
                        : language === 'ar'
                        ? 'اكتب رسالتك هنا (يدعم العربية والإنجليزية والرموز والأسطر الجديدة)...'
                        : 'Type your message (supports Arabic, English, emojis, multiline)...'
                    }
                    disabled={sending || uploadingAttachment}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#003366] resize-none max-h-36 leading-relaxed"
                  />

                  <button
                    type="submit"
                    aria-label={language === 'ar' ? 'إرسال الرسالة' : 'Send message'}
                    disabled={(!validateAndNormalizeMessageText(messageText, false).valid && !uploadingAttachment) || sending}
                    className="p-2.5 sm:px-4 rounded-xl bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-40 transition-colors cursor-pointer shrink-0 shadow-xs inline-flex items-center gap-1.5 font-bold text-xs"
                  >
                    {sending ? (
                      <RefreshCw size={17} className="animate-spin" />
                    ) : (
                      <Send size={17} className={isRTL ? 'rotate-180' : ''} />
                    )}
                    <span className="hidden sm:inline">
                      {sending
                        ? language === 'ar'
                          ? 'جارٍ الإرسال...'
                          : 'Sending...'
                        : language === 'ar'
                        ? 'إرسال'
                        : 'Send'}
                    </span>
                  </button>
                </form>

                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                  <span className="flex items-center gap-1">
                    {isOnline ? (
                      <>
                        <Wifi size={11} className="text-emerald-600" />
                        <span>{language === 'ar' ? 'متصل — إرسال فوري مشفر' : 'Online — Real-time sync active'}</span>
                      </>
                    ) : (
                      <>
                        <WifiOff size={11} className="text-amber-600" />
                        <span>{language === 'ar' ? 'غير متصل بالإنترنت' : 'Offline'}</span>
                      </>
                    )}
                    <span className="hidden sm:inline">
                      · {language === 'ar' ? 'Shift+Enter لسطر جديد' : 'Shift+Enter for new line'}
                    </span>
                  </span>
                  <span
                    className={
                      Array.from(messageText).length > MAX_CHAT_MESSAGE_LENGTH
                        ? 'text-red-600 font-bold'
                        : ''
                    }
                  >
                    {Array.from(messageText).length}/{MAX_CHAT_MESSAGE_LENGTH}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
            <MessageSquare size={36} className="text-slate-300" />
            <p className="font-bold text-slate-700">
              {selectedCategory
                ? language === 'ar'
                  ? 'اختر محادثة أو جهة تواصل من القائمة'
                  : 'Select a conversation or contact from the list'
                : language === 'ar'
                ? 'اختر فئة التواصل أولاً من القائمة الجانبية'
                : 'Select a recipient category from the sidebar'}
            </p>
            <p className="text-xs text-slate-400 max-w-sm">
              {language === 'ar'
                ? 'تم تصنيف المراسلة حسب فئة المؤسسة والمستلم لضمان السرية وسرعة الوصول لجهات الاتصال المعتمدة.'
                : 'Messaging is organized by institution/recipient category for strict privacy and fast navigation.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
