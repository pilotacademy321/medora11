import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_CHAT_MESSAGE_LENGTH,
  classifyMessagingError,
  createClientMessageId,
  mergeAndSortConversationMessages,
  runWithNetworkTimeout,
  validateAndNormalizeMessageText,
} from './messagingEngine';
import {
  buildScopedConversationId,
  canCommunicateWithPeer,
  getAuthorizedCategoriesForRole,
  getConversationParticipantIds,
  getConversationPeerDisplay,
} from './messagingPermissions';
import { ChatMessage, Conversation, UserRole } from '../types';

test('supports all Arabic letters, diacritics, Arabic-Indic numerals, and Arabic punctuation', () => {
  const fullArabic =
    'أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي ة ى ء أ إ آ ؤ ئ\n' +
    'تشكيل: مَرْحَباً بِكُمْ فِي مِنْصَّةِ مِيدُورَا ٠١٢٣٤٥٦٧٨٩ ، ؛ ؟ !';

  const res = validateAndNormalizeMessageText(fullArabic);
  assert.equal(res.valid, true);
  assert.equal(res.normalizedText, fullArabic);
});

test('supports all English letters, ASCII digits, punctuation, symbols, and emojis', () => {
  const fullEnglish =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789\n' +
    'Punctuation & Symbols: !@#$%^&*()_+-=[]{};:\'",.<>/?\\|`~\n' +
    'Emojis: 🩺❤️💊🏥🩻🧪✅⚠️';

  const res = validateAndNormalizeMessageText(fullEnglish);
  assert.equal(res.valid, true);
  assert.equal(res.normalizedText, fullEnglish);
});

test('rejects empty and whitespace-only messages (spaces, tabs, newlines, NBSP, zero-width)', () => {
  const blanks = ['', '   ', '\n\n\t  \r\n', '\u00A0\u200B\uFEFF'];
  for (const blank of blanks) {
    const res = validateAndNormalizeMessageText(blank, false);
    assert.equal(res.valid, false);
    assert.equal(res.errorCode, 'empty_message');
  }

  // Attachment-only send is allowed cleanly
  const attachRes = validateAndNormalizeMessageText('   ', true);
  assert.equal(attachRes.valid, true);
  assert.equal(attachRes.normalizedText, '');
});

test('supports long multiline text and normalizes CRLF without losing internal lines or indentation', () => {
  const paragraph = 'الفقرة الأولى: يرجى تناول الدواء بعد الطعام.\r\n  - الجرعة الصباحية\r\n  - الجرعة المسائية\r\n';
  const repeated = `${paragraph}Follow-up notes line `.repeat(20);
  assert.ok(repeated.length > 500 && repeated.length < MAX_CHAT_MESSAGE_LENGTH);

  const validRes = validateAndNormalizeMessageText(repeated);
  assert.equal(validRes.valid, true);
  assert.ok(validRes.normalizedText.includes('\n  - الجرعة الصباحية\n'));
  assert.ok(!validRes.normalizedText.includes('\r'));

  const oversized = 'أ'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1);
  const overRes = validateAndNormalizeMessageText(oversized);
  assert.equal(overRes.valid, false);
  assert.equal(overRes.errorCode, 'message_too_long');
});

test('authorizes all supported account pairs and blocks unauthorized roles or unlinked accounts', () => {
  const allowedPairs: Array<[UserRole, UserRole, string]> = [
    ['patient', 'doctor', 'doctor_patient'],
    ['doctor', 'patient', 'doctor_patient'],
    ['patient', 'laboratory', 'lab_patient'],
    ['laboratory', 'patient', 'lab_patient'],
    ['patient', 'radiology_center', 'radiology_patient'],
    ['radiology_center', 'patient', 'radiology_patient'],
    ['patient', 'pharmacy', 'pharmacy_customer'],
    ['pharmacy', 'patient', 'pharmacy_customer'],
    ['pharmacy', 'wholesaler', 'wholesaler_pharmacy'],
    ['wholesaler', 'pharmacy', 'wholesaler_pharmacy'],
  ];

  for (const [senderRole, targetRole, expectedRel] of allowedPairs) {
    const ok = canCommunicateWithPeer({
      senderRole,
      senderUid: `uid_${senderRole}_1`,
      targetRole,
      targetUid: `uid_${targetRole}_2`,
      hasVerifiedRelationship: true,
    });
    assert.equal(ok.allowed, true, `Expected ${senderRole} <-> ${targetRole} to be allowed`);
    assert.equal(ok.relationshipType, expectedRel);

    const unlinked = canCommunicateWithPeer({
      senderRole,
      senderUid: `uid_${senderRole}_1`,
      targetRole,
      targetUid: `uid_${targetRole}_2`,
      hasVerifiedRelationship: false,
    });
    assert.equal(unlinked.allowed, false, `Expected unlinked ${senderRole} <-> ${targetRole} to be denied`);
  }

  // Super Admin can message all roles including secretary
  const allRoles: UserRole[] = [
    'patient',
    'doctor',
    'laboratory',
    'radiology_center',
    'pharmacy',
    'wholesaler',
    'secretary',
  ];
  for (const targetRole of allRoles) {
    const adminRes = canCommunicateWithPeer({
      senderRole: 'super_admin',
      senderUid: 'admin_bcgmoc',
      targetRole,
      targetUid: `uid_${targetRole}`,
      hasVerifiedRelationship: false,
    });
    assert.equal(adminRes.allowed, true);
    assert.equal(adminRes.relationshipType, 'admin_support');
  }

  // Strictly forbidden pairs regardless of relationship flag
  const forbiddenPairs: Array<[UserRole, UserRole]> = [
    ['patient', 'patient'],
    ['patient', 'wholesaler'],
    ['doctor', 'pharmacy'],
    ['doctor', 'wholesaler'],
    ['laboratory', 'pharmacy'],
    ['secretary', 'patient'],
  ];
  for (const [r1, r2] of forbiddenPairs) {
    const res = canCommunicateWithPeer({
      senderRole: r1,
      senderUid: 'u1',
      targetRole: r2,
      targetUid: 'u2',
      hasVerifiedRelationship: true,
    });
    assert.equal(res.allowed, false, `Forbidden pair ${r1} <-> ${r2} should fail`);
  }
});

test('infers peer role accurately from relationshipType when participant metadata is absent', () => {
  const conv: Conversation = {
    id: 'conv_admin_support_u1_admin1',
    participantIds: ['u1', 'admin1'],
    participants: {},
    relationshipType: 'admin_support',
    unreadCounts: {},
    lastMessageText: 'Support',
    lastMessageTimestamp: '2026-11-13T10:00:00.000Z',
    lastSenderUid: 'admin1',
    createdAt: '2026-11-13T10:00:00.000Z',
    updatedAt: '2026-11-13T10:00:00.000Z',
  };
  const peer = getConversationPeerDisplay(conv, 'u1');
  assert.equal(peer.uid, 'admin1');
  assert.equal(peer.role, 'super_admin');
});

test('deduplicates and chronologically sorts messages across server snapshots and failed outbox retries', () => {
  const server: ChatMessage[] = [
    {
      id: 'msg_2',
      conversationId: 'c1',
      senderId: 'u2',
      senderName: 'Doctor',
      senderRole: 'doctor',
      text: 'Second',
      timestamp: '2026-11-13T10:00:02.000Z',
      read: true,
    },
    {
      id: 'msg_1',
      conversationId: 'c1',
      senderId: 'u1',
      senderName: 'Patient',
      senderRole: 'patient',
      text: 'First',
      timestamp: '2026-11-13T10:00:01.000Z',
      read: true,
    },
  ];

  // Outbox still holds msg_2 (just landed on server) + failed msg_3
  const merged = mergeAndSortConversationMessages(server, [
    {
      ...server[0],
      deliveryState: 'sending',
    },
    {
      id: 'msg_3',
      conversationId: 'c1',
      senderId: 'u1',
      senderName: 'Patient',
      senderRole: 'patient',
      text: 'Third failed retryable',
      timestamp: '2026-11-13T10:00:03.000Z',
      read: false,
      deliveryState: 'failed',
      errorCode: 'offline',
      errorMessage: 'Offline',
      retryable: true,
    },
  ]);

  assert.equal(merged.length, 3);
  assert.deepEqual(
    merged.map((m) => [m.id, m.deliveryState]),
    [
      ['msg_1', 'sent'],
      ['msg_2', 'sent'],
      ['msg_3', 'failed'],
    ]
  );
});

test('simulates full messaging lifecycle: multi-role send/receive, persistence across reload/relogin, offline->retry without duplicates, and unauthorized block', async () => {
  // Mini in-memory Firestore-like store enforcing participantIds & admin rules
  const conversations = new Map<string, Conversation>();
  const messagesByConv = new Map<string, Map<string, ChatMessage>>();
  let online = true;

  const isAuthorizedForConv = (uid: string, role: UserRole, conv: Conversation) => {
    if (role === 'super_admin') return true;
    return getConversationParticipantIds(conv).includes(uid);
  };

  const sendMessage = async (params: {
    senderUid: string;
    senderRole: UserRole;
    targetUid: string;
    targetRole: UserRole;
    hasRel: boolean;
    rawText: string;
    msgId?: string;
  }) => {
    const authCheck = canCommunicateWithPeer({
      senderRole: params.senderRole,
      senderUid: params.senderUid,
      targetRole: params.targetRole,
      targetUid: params.targetUid,
      hasVerifiedRelationship: params.hasRel,
    });
    if (!authCheck.allowed || !authCheck.relationshipType) {
      throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    }
    const val = validateAndNormalizeMessageText(params.rawText);
    if (!val.valid) {
      throw new Error(val.errorEn);
    }
    if (!online) {
      throw Object.assign(new Error('network_offline'), { code: 'offline' });
    }

    const convId = buildScopedConversationId(params.senderUid, params.targetUid, authCheck.relationshipType);
    const existing = conversations.get(convId);
    if (existing && !isAuthorizedForConv(params.senderUid, params.senderRole, existing)) {
      throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    }

    const now = new Date().toISOString();
    const conv: Conversation = existing || {
      id: convId,
      participantIds: [params.senderUid, params.targetUid].sort(),
      participants: {},
      relationshipType: authCheck.relationshipType,
      unreadCounts: {},
      lastMessageText: val.normalizedText,
      lastMessageTimestamp: now,
      lastSenderUid: params.senderUid,
      createdAt: now,
      updatedAt: now,
    };
    conversations.set(convId, { ...conv, lastMessageText: val.normalizedText, updatedAt: now });

    const msgId = params.msgId || createClientMessageId();
    const convMsgs = messagesByConv.get(convId) || new Map<string, ChatMessage>();
    // Idempotent setDoc by msgId
    convMsgs.set(msgId, {
      id: msgId,
      conversationId: convId,
      senderId: params.senderUid,
      senderName: params.senderUid,
      senderRole: params.senderRole,
      text: val.normalizedText,
      timestamp: now,
      read: false,
    });
    messagesByConv.set(convId, convMsgs);
    return { convId, msgId };
  };

  const readMessagesForUser = (uid: string, role: UserRole, convId: string) => {
    const conv = conversations.get(convId);
    if (!conv || !isAuthorizedForConv(uid, role, conv)) {
      throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    }
    return mergeAndSortConversationMessages(
      Array.from(messagesByConv.get(convId)?.values() || [])
    );
  };

  // 1. Patient <-> Doctor Bilingual + Emoji + Multiline send
  const { convId } = await sendMessage({
    senderUid: 'pat_1',
    senderRole: 'patient',
    targetUid: 'doc_1',
    targetRole: 'doctor',
    hasRel: true,
    rawText: 'مرحباً دكتور 👨‍⚕️\nPlease check my CBC result #123.',
  });

  // 2. Correct recipient receives it; unauthorized outsider is blocked
  const docInbox = readMessagesForUser('doc_1', 'doctor', convId);
  assert.equal(docInbox.length, 1);
  assert.equal(docInbox[0].text, 'مرحباً دكتور 👨‍⚕️\nPlease check my CBC result #123.');

  assert.throws(
    () => readMessagesForUser('stranger_pat_99', 'patient', convId),
    /Missing or insufficient permissions/
  );

  // 3. Offline disconnect -> fail honestly -> preserve msgId -> reconnect & retry cleanly with zero duplicates
  online = false;
  const retryMsgId = createClientMessageId();
  let preservedDraft = 'رسالة أثناء انقطاع الإنترنت 🔌';
  await assert.rejects(
    () =>
      sendMessage({
        senderUid: 'pat_1',
        senderRole: 'patient',
        targetUid: 'doc_1',
        targetRole: 'doctor',
        hasRel: true,
        rawText: preservedDraft,
        msgId: retryMsgId,
      }),
    (err: any) => {
      const classified = classifyMessagingError(err, online);
      assert.equal(classified.code, 'offline');
      assert.equal(classified.retryable, true);
      return true;
    }
  );
  // Ensure message was NOT added while offline
  assert.equal(readMessagesForUser('pat_1', 'patient', convId).length, 1);

  // Reconnect & retry twice with the SAME idempotent msgId
  online = true;
  await sendMessage({
    senderUid: 'pat_1',
    senderRole: 'patient',
    targetUid: 'doc_1',
    targetRole: 'doctor',
    hasRel: true,
    rawText: preservedDraft,
    msgId: retryMsgId,
  });
  await sendMessage({
    senderUid: 'pat_1',
    senderRole: 'patient',
    targetUid: 'doc_1',
    targetRole: 'doctor',
    hasRel: true,
    rawText: preservedDraft,
    msgId: retryMsgId,
  });

  // Simulated reload / logout + login restores exact 2 deduplicated messages in order
  const restoredAfterRelogin = readMessagesForUser('pat_1', 'patient', convId);
  assert.equal(restoredAfterRelogin.length, 2);
  assert.equal(restoredAfterRelogin[1].id, retryMsgId);
  assert.equal(restoredAfterRelogin[1].text, preservedDraft);

  // 4. Pharmacy <-> Wholesaler B2B messaging
  const b2b = await sendMessage({
    senderUid: 'pharm_1',
    senderRole: 'pharmacy',
    targetUid: 'whole_1',
    targetRole: 'wholesaler',
    hasRel: true,
    rawText: 'طلب وجبة أموكسيسيلين 500mg — الكمية 20 علبة 📦',
  });
  assert.equal(readMessagesForUser('whole_1', 'wholesaler', b2b.convId).length, 1);

  // 5. Super Admin can inspect/support any thread
  assert.equal(readMessagesForUser('admin_uid', 'super_admin', convId).length, 2);
});

test('classifies permission, auth expiry, offline, timeout, and network errors accurately', async () => {
  assert.equal(
    classifyMessagingError(new Error('Missing or insufficient permissions.'), true).code,
    'permission-denied'
  );
  assert.equal(
    classifyMessagingError({ code: 'unauthenticated', message: 'session_expired' }, true).requiresReauth,
    true
  );
  assert.equal(
    classifyMessagingError(new Error('any'), false).code,
    'offline'
  );
  assert.equal(
    classifyMessagingError({ code: 'unavailable', message: 'network error' }, true).retryable,
    true
  );

  await assert.rejects(
    () => runWithNetworkTimeout(new Promise(() => {}), 25),
    /network_timeout/
  );
});

test('firestore.rules enforces authenticated messaging, valid IDs, and Admin/participant access without public open rules or exists() in list', () => {
  const rulesSrc = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.ok(rulesSrc.includes('allow read, write: if false;'));
  assert.ok(rulesSrc.includes('function isSuperAdminEmail()'));
  assert.ok(rulesSrc.includes('function isParentConversationParticipant(convId)'));
  assert.ok(rulesSrc.includes('incoming().conversationId == convId'));
  assert.ok(rulesSrc.includes('incoming().text is string'));
  assert.ok(!/allow read,\s*write:\s*if\s*true/.test(rulesSrc));
  assert.ok(getAuthorizedCategoriesForRole('pharmacy').some((c) => c.role === 'wholesaler'));

  // Ensure conversations allow list has no exists()/get()/isAdmin() lookup and checks participantIds directly
  const convMatch = rulesSrc.match(/match \/conversations\/\{convId\}\s*\{[\s\S]*?allow list:\s*if\s*([\s\S]*?);/);
  assert.ok(convMatch && convMatch[1], 'conversations allow list block must exist');
  assert.ok(convMatch[1].includes('request.auth.uid in resource.data.participantIds'));
  assert.ok(convMatch[1].includes('resource.data.doctorId == request.auth.uid'));
  assert.ok(convMatch[1].includes('resource.data.patientId == request.auth.uid'));
  assert.ok(convMatch[1].includes('isSuperAdminEmail()'));
  assert.ok(!convMatch[1].includes('isAdmin()'), 'conversations allow list must not call isAdmin() / exists()');
  assert.ok(!convMatch[1].includes('exists('), 'conversations allow list must not call exists()');
  assert.ok(!convMatch[1].includes('get('), 'conversations allow list must not call get()');

  const msgMatch = rulesSrc.match(/match \/messages\/\{msgId\}\s*\{[\s\S]*?allow list:\s*if\s*([\s\S]*?);/);
  assert.ok(msgMatch && msgMatch[1], 'messages allow list block must exist');
  assert.ok(msgMatch[1].includes('isSuperAdminEmail()'));
  assert.ok(msgMatch[1].includes('isParentConversationParticipant(convId)'));
  assert.ok(!msgMatch[1].includes('isAdmin()'), 'messages allow list must not call isAdmin()');
});

test('PrivateMessagingWorkspace guards onSnapshot listeners with auth readiness and server-confirmed conversation check', () => {
  const workspaceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/PrivateMessagingWorkspace.tsx'),
    'utf8'
  );
  assert.ok(workspaceSrc.includes('onAuthStateChanged(auth'));
  assert.ok(workspaceSrc.includes('authReadyUid !== currentUserUid'));
  assert.ok(workspaceSrc.includes('isPersistedConversation'));
  assert.ok(workspaceSrc.includes('!isPersistedConversation'));
  assert.ok(workspaceSrc.includes('serverConfirmedConvIds'));
  assert.ok(workspaceSrc.includes('includeMetadataChanges: true'));
  assert.ok(workspaceSrc.includes('hasPendingWrites'));
});
