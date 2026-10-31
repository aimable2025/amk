import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import {
  db,
  type ChatMessageComment,
  type LocalBroadcast,
  type LocalChatMessage,
  type LocalDebt,
  type LocalInterAgencyTransfer,
} from '../lib/db';
import type { AppUser } from '../types/auth';
import { recordAuditLog } from './AuditService';

/* =========================================================
   1. CHAT INTERNE — MESSAGERIE PROFESSIONNELLE
   ========================================================= */

export async function getAuthorizedChatMessages(
  user: AppUser | null
): Promise<LocalChatMessage[]> {
  if (!user) return [];
  const all = await db.chatMessages.toArray();
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const visible = all.filter((msg) => {
    // 1. Canal Réseau Général : visible par tous
    if (msg.channelType === 'global') return true;

    // 2. Canal Agence : visible par les employés de cette agence ou direction générale
    if (msg.channelType === 'agence') {
      return isGlobal || !msg.agencyId || (user.agencyId && msg.agencyId === user.agencyId);
    }

    // 3. Conversation privée directe : visible par l'expéditeur, le destinataire et DG/Admin
    if (msg.channelType === 'prive') {
      return (
        isGlobal ||
        msg.senderId === user.uid ||
        msg.recipientId === user.uid
      );
    }

    // 4. Chat en Groupe :
    // - Si groupe restreint avec liste de participants : visible uniquement par eux ou DG/Admin
    // - Si groupe d'entreprise sans participants restreints (Coordination, Trésorerie, Flotte) : visible par tous
    if (msg.channelType === 'groupe') {
      if (msg.groupParticipantIds && msg.groupParticipantIds.length > 0) {
        return (
          isGlobal ||
          msg.senderId === user.uid ||
          msg.groupParticipantIds.includes(user.uid)
        );
      }
      return isGlobal || !msg.agencyId || (user.agencyId && msg.agencyId === user.agencyId);
    }

    // 5. Service en particulier : visible par les agents de l'agence ou de tout le réseau si non restreint
    if (msg.channelType === 'service') {
      return isGlobal || !msg.agencyId || (user.agencyId && msg.agencyId === user.agencyId);
    }

    return true;
  });

  return visible.sort((a, b) => a.createdAt - b.createdAt);
}

export interface SendChatMessageInput {
  channelType: LocalChatMessage['channelType'];
  channelId: string;
  channelName: string;
  agencyId?: string | null;
  recipientId?: string | null;
  recipientName?: string | null;
  serviceTag?: string | null;
  groupName?: string | null;
  groupParticipantIds?: string[];
  groupParticipantNames?: string[];
  replyToMessageId?: string | null;
  replyToSenderName?: string | null;
  replyToExcerpt?: string | null;
  forwardedFromSenderName?: string | null;
  content: string;
  attachmentType?: 'none' | 'image' | 'document';
  attachmentName?: string | null;
  attachmentDataUrl?: string | null;
}

export async function sendChatMessage(
  input: SendChatMessageInput,
  user: AppUser
): Promise<LocalChatMessage> {
  if (!user || !user.uid) {
    throw new Error('Utilisateur non authentifié.');
  }

  const trimmedContent = (input.content || '').trim();
  if (!trimmedContent && !input.attachmentDataUrl && !input.attachmentName) {
    throw new Error('Le message ne peut pas être vide.');
  }

  if (input.channelType === 'prive' && !input.recipientId) {
    throw new Error('Veuillez sélectionner un utilisateur destinataire valide.');
  }

  const now = Date.now();
  const id = `msg-${now}-${Math.random().toString(36).substring(2, 8)}`;

  // Déterminer l'agence associée : pour le réseau global ou les groupes inter-agences, agencyId est null
  let agencyId: string | null = null;
  if (input.channelType === 'agence') {
    agencyId = input.agencyId !== undefined ? input.agencyId : (user.agencyId ?? null);
  } else if (input.channelType === 'service') {
    agencyId = input.agencyId !== undefined ? input.agencyId : (user.agencyId ?? null);
  } else if (input.channelType === 'groupe') {
    agencyId = input.agencyId !== undefined ? input.agencyId : null;
  }

  const msg: LocalChatMessage = {
    id,
    channelType: input.channelType,
    channelId: input.channelId,
    channelName: input.channelName || '',
    agencyId,
    senderId: user.uid,
    senderName: user.displayName || user.email || 'Utilisateur',
    senderRole: user.role || 'agent',
    recipientId: input.recipientId ?? null,
    recipientName: input.recipientName ?? null,
    serviceTag: input.serviceTag ?? null,
    groupName: input.groupName ?? null,
    groupParticipantIds: input.groupParticipantIds || [],
    groupParticipantNames: input.groupParticipantNames || [],
    replyToMessageId: input.replyToMessageId ?? null,
    replyToSenderName: input.replyToSenderName ?? null,
    replyToExcerpt: input.replyToExcerpt ?? null,
    forwardedFromSenderName: input.forwardedFromSenderName ?? null,
    reactions: {},
    comments: [],
    content: trimmedContent,
    attachmentType: input.attachmentType || 'none',
    attachmentName: input.attachmentName || null,
    attachmentDataUrl: input.attachmentDataUrl || null,
    readBy: [user.uid],
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  // 1. Enregistrement local immédiat (Offline-First)
  await db.chatMessages.put(msg);

  // 2. Écriture distante Firestore réelle si en ligne
  let remotelyDelivered = false;
  let remoteError: string | null = null;

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const cleanRemoteData = {
        id: msg.id,
        channelType: msg.channelType,
        channelId: msg.channelId,
        channelName: msg.channelName,
        agencyId: msg.agencyId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        recipientId: msg.recipientId,
        recipientName: msg.recipientName,
        serviceTag: msg.serviceTag,
        groupName: msg.groupName,
        groupParticipantIds: msg.groupParticipantIds,
        groupParticipantNames: msg.groupParticipantNames,
        replyToMessageId: msg.replyToMessageId,
        replyToSenderName: msg.replyToSenderName,
        replyToExcerpt: msg.replyToExcerpt,
        forwardedFromSenderName: msg.forwardedFromSenderName,
        reactions: msg.reactions,
        comments: msg.comments,
        content: msg.content,
        attachmentType: msg.attachmentType,
        attachmentName: msg.attachmentName,
        attachmentDataUrl:
          msg.attachmentDataUrl && msg.attachmentDataUrl.length < 800000
            ? msg.attachmentDataUrl
            : null,
        readBy: msg.readBy,
        syncStatus: 'synced',
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        syncedAt: serverTimestamp(),
      };

      await setDoc(doc(firestore, 'messages', id), cleanRemoteData, { merge: true });
      remotelyDelivered = true;
      msg.syncStatus = 'synced';
      await db.chatMessages.update(id, {
        syncStatus: 'synced',
        updatedAt: Date.now(),
      });
    } catch (err: unknown) {
      remoteError = err instanceof Error ? err.message : 'Échec de transmission distante';
      console.warn('[Chat] Échec envoi Firestore direct:', remoteError);
    }
  }

  // 3. Si non transmis immédiatement (hors-ligne ou échec distant), enfiler dans la file de sync
  if (!remotelyDelivered) {
    await db.syncQueue.add({
      entity: 'chatMessage',
      entityId: id,
      operation: 'create',
      attempts: 0,
      lastError: remoteError,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  return msg;
}

export async function toggleChatMessageReaction(
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const existing = await db.chatMessages.get(messageId);
  if (!existing) return;

  const currentReactions: Record<string, string[]> = {
    ...(existing.reactions || {}),
  };
  const list = currentReactions[emoji] || [];
  if (list.includes(userId)) {
    const nextList = list.filter((id) => id !== userId);
    if (nextList.length === 0) {
      delete currentReactions[emoji];
    } else {
      currentReactions[emoji] = nextList;
    }
  } else {
    currentReactions[emoji] = [...list, userId];
  }

  const now = Date.now();
  await db.chatMessages.update(messageId, {
    reactions: currentReactions,
    updatedAt: now,
  });

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await updateDoc(doc(firestore, 'messages', messageId), {
        reactions: currentReactions,
        updatedAt: now,
      });
      return;
    } catch {
      // Repli syncQueue
    }
  }

  await db.syncQueue.add({
    entity: 'chatMessage',
    entityId: messageId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export async function addChatMessageComment(
  messageId: string,
  content: string,
  user: AppUser
): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return;
  const existing = await db.chatMessages.get(messageId);
  if (!existing) return;

  const now = Date.now();
  const newComment: ChatMessageComment = {
    id: `cmt-${now}-${Math.random().toString(36).substring(2, 7)}`,
    authorId: user.uid,
    authorName: user.displayName || user.email || 'Utilisateur',
    authorRole: user.role,
    content: trimmed,
    createdAt: now,
  };

  const updatedComments = [...(existing.comments || []), newComment];
  await db.chatMessages.update(messageId, {
    comments: updatedComments,
    updatedAt: now,
  });

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await updateDoc(doc(firestore, 'messages', messageId), {
        comments: updatedComments,
        updatedAt: now,
      });
      return;
    } catch {
      // Repli syncQueue
    }
  }

  await db.syncQueue.add({
    entity: 'chatMessage',
    entityId: messageId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export async function markChatMessageAsRead(
  messageId: string,
  userId: string
): Promise<void> {
  const existing = await db.chatMessages.get(messageId);
  if (!existing) return;
  if (existing.readBy?.includes(userId)) return;

  const updatedReadBy = Array.from(new Set([...(existing.readBy || []), userId]));
  const now = Date.now();
  await db.chatMessages.update(messageId, {
    readBy: updatedReadBy,
    updatedAt: now,
  });

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await updateDoc(doc(firestore, 'messages', messageId), {
        readBy: arrayUnion(userId),
        updatedAt: now,
      });
      return;
    } catch {
      // Repli syncQueue
    }
  }

  await db.syncQueue.add({
    entity: 'chatMessage',
    entityId: messageId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export async function editChatMessage(
  messageId: string,
  newContent: string,
  user: AppUser
): Promise<void> {
  const existing = await db.chatMessages.get(messageId);
  if (!existing) return;
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';
  if (existing.senderId !== user.uid && !isGlobal) {
    throw new Error("Vous n'êtes pas autorisé à modifier ce message.");
  }
  const trimmed = newContent.trim();
  if (!trimmed) return;
  const now = Date.now();
  await db.chatMessages.update(messageId, {
    content: trimmed,
    updatedAt: now,
  });

  let synced = false;
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await updateDoc(doc(firestore, 'messages', messageId), {
        content: trimmed,
        updatedAt: now,
        syncedAt: serverTimestamp(),
      });
      await db.chatMessages.update(messageId, {
        syncStatus: 'synced',
        updatedAt: now,
      });
      synced = true;
    } catch {
      // Repli syncQueue
    }
  }

  if (!synced) {
    await db.syncQueue.add({
      entity: 'chatMessage',
      entityId: messageId,
      operation: 'update',
      attempts: 0,
      lastError: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function deleteChatMessage(
  messageId: string,
  user: AppUser
): Promise<void> {
  const existing = await db.chatMessages.get(messageId);
  if (!existing) return;
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';
  if (existing.senderId !== user.uid && !isGlobal) {
    throw new Error("Vous n'êtes pas autorisé à supprimer ce message.");
  }
  await db.chatMessages.delete(messageId);

  let synced = false;
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await deleteDoc(doc(firestore, 'messages', messageId));
      synced = true;
    } catch {
      // Repli syncQueue
    }
  }

  if (!synced) {
    await db.syncQueue.add({
      entity: 'chatMessage',
      entityId: messageId,
      operation: 'delete',
      attempts: 0,
      lastError: null,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

export async function retrySendChatMessage(messageId: string): Promise<boolean> {
  const existing = await db.chatMessages.get(messageId);
  if (!existing) return false;
  const now = Date.now();

  let delivered = false;
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const cleanRemoteData = {
        id: existing.id,
        channelType: existing.channelType,
        channelId: existing.channelId,
        channelName: existing.channelName,
        agencyId: existing.agencyId,
        senderId: existing.senderId,
        senderName: existing.senderName,
        senderRole: existing.senderRole,
        recipientId: existing.recipientId || null,
        recipientName: existing.recipientName || null,
        serviceTag: existing.serviceTag || null,
        groupName: existing.groupName || null,
        groupParticipantIds: existing.groupParticipantIds || [],
        groupParticipantNames: existing.groupParticipantNames || [],
        replyToMessageId: existing.replyToMessageId || null,
        replyToSenderName: existing.replyToSenderName || null,
        replyToExcerpt: existing.replyToExcerpt || null,
        forwardedFromSenderName: existing.forwardedFromSenderName || null,
        reactions: existing.reactions || {},
        comments: existing.comments || [],
        content: existing.content,
        attachmentType: existing.attachmentType || 'none',
        attachmentName: existing.attachmentName || null,
        attachmentDataUrl:
          existing.attachmentDataUrl && existing.attachmentDataUrl.length < 800000
            ? existing.attachmentDataUrl
            : null,
        readBy: existing.readBy || [existing.senderId],
        syncStatus: 'synced',
        createdAt: existing.createdAt,
        updatedAt: now,
        syncedAt: serverTimestamp(),
      };

      await setDoc(doc(firestore, 'messages', messageId), cleanRemoteData, { merge: true });
      delivered = true;
      await db.chatMessages.update(messageId, {
        syncStatus: 'synced',
        updatedAt: now,
      });

      const queueItems = await db.syncQueue
        .where('entityId')
        .equals(messageId)
        .toArray();
      for (const qi of queueItems) {
        if (qi.id) {
          await db.syncQueue.update(qi.id, { status: 'completed', updatedAt: now });
        }
      }
    } catch (err: unknown) {
      console.warn('[Chat] Échec renvoi Firestore:', err);
    }
  }

  if (!delivered) {
    await db.chatMessages.update(messageId, {
      syncStatus: 'pending',
      updatedAt: now,
    });
    await db.syncQueue.add({
      entity: 'chatMessage',
      entityId: messageId,
      operation: 'create',
      attempts: 0,
      lastError: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  return delivered;
}

export function subscribeToChatMessagesRealtime(
  user: AppUser | null,
  onUpdate: () => void
): () => void {
  if (!user) return () => {};

  let activeUnsubscribe: (() => void) | null = null;
  let isCleanedUp = false;

  const processSnapshot = async (snapshot: any) => {
    let hasNewOrChanged = false;
    for (const change of snapshot.docChanges()) {
      const data = change.doc.data() as LocalChatMessage;
      const id = data.id || change.doc.id;
      if (change.type === 'removed') {
        const local = await db.chatMessages.get(id);
        if (local) {
          await db.chatMessages.delete(id);
          hasNewOrChanged = true;
        }
      } else {
        const local = await db.chatMessages.get(id);
        if (local && (local.syncStatus === 'pending' || local.syncStatus === 'local')) {
          // Fusionner les réactions et accusés de lecture sans écraser le statut local en attente
          const mergedReactions = { ...(data.reactions || {}), ...(local.reactions || {}) };
          const mergedReadBy = Array.from(new Set([...(data.readBy || []), ...(local.readBy || [])]));
          await db.chatMessages.update(id, {
            reactions: mergedReactions,
            readBy: mergedReadBy,
          });
          hasNewOrChanged = true;
        } else {
          await db.chatMessages.put({
            ...data,
            id,
            syncStatus: 'synced',
          });
          hasNewOrChanged = true;
        }
      }
    }
    if (hasNewOrChanged) {
      onUpdate();
    }
  };

  try {
    const qWithOrder = query(
      collection(firestore, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(250)
    );

    activeUnsubscribe = onSnapshot(
      qWithOrder,
      (snapshot) => {
        void processSnapshot(snapshot);
      },
      (error) => {
        console.warn('[ChatRealtime] Notification Firestore avec tri:', error.message);
        if (!isCleanedUp) {
          try {
            const qFallback = query(collection(firestore, 'messages'), limit(250));
            activeUnsubscribe = onSnapshot(
              qFallback,
              (fallbackSnap) => {
                void processSnapshot(fallbackSnap);
              },
              (fallbackErr) => {
                console.warn('[ChatRealtime] Notification repli Firestore:', fallbackErr.message);
              }
            );
          } catch {
            // Silence
          }
        }
      }
    );
  } catch (err) {
    console.warn('[ChatRealtime] Initialisation écoute temps-réel:', err);
    try {
      const qFallback = query(collection(firestore, 'messages'), limit(250));
      activeUnsubscribe = onSnapshot(
        qFallback,
        (fallbackSnap) => {
          void processSnapshot(fallbackSnap);
        },
        () => {}
      );
    } catch {
      // Ignorer
    }
  }

  return () => {
    isCleanedUp = true;
    if (activeUnsubscribe) {
      activeUnsubscribe();
      activeUnsubscribe = null;
    }
  };
}

/**
 * Assistant Intelligent Ets AMANI : analyse en temps réel les données locales Dexie
 * dans le strict respect du périmètre RBAC de l'utilisateur.
 */
export async function generateIntelligentBusinessAnalysis(
  question: string,
  user: AppUser
): Promise<string> {
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';
  const scopeAgencyId = isGlobal ? null : user.agencyId || null;

  const [billetages, ops, debts, transfers, smsOps] = await Promise.all([
    db.billetages.toArray(),
    db.operations.toArray(),
    db.debts.toArray(),
    db.interAgencyTransfers.toArray(),
    db.smsOperations.toArray(),
  ]);

  const myBilletages = billetages.filter(
    (b) => (!scopeAgencyId || b.agencyId === scopeAgencyId) && b.status !== 'cancelled'
  );
  const myOps = ops.filter((o) => !scopeAgencyId || o.agencyId === scopeAgencyId);
  const myDebts = debts.filter(
    (d) => (!scopeAgencyId || d.agencyId === scopeAgencyId) && d.status !== 'rembourse'
  );
  const myTransfers = transfers.filter(
    (t) =>
      !scopeAgencyId ||
      t.sourceAgencyId === scopeAgencyId ||
      t.targetAgencyId === scopeAgencyId
  );
  const mySms = smsOps.filter((s) => !scopeAgencyId || s.agencyId === scopeAgencyId);

  let usdCaisse = 0;
  let cdfCaisse = 0;
  let discrepancyCount = 0;
  for (const b of myBilletages) {
    const val = Number(b.calculatedTotal || b.declaredAmount || 0);
    if (b.currency === 'USD') usdCaisse += val;
    if (b.currency === 'CDF') cdfCaisse += val;
    if (b.discrepancy && Math.abs(b.discrepancy) > 0) discrepancyCount++;
  }

  const pendingOps = myOps.filter(
    (o) => o.status !== 'termine' && o.status !== 'annule' && o.status !== 'rejete'
  );

  let debtUSD = 0;
  let debtCDF = 0;
  for (const d of myDebts) {
    if (d.currency === 'USD') debtUSD += d.remainingAmount;
    if (d.currency === 'CDF') debtCDF += d.remainingAmount;
  }

  const pendingTransfers = myTransfers.filter(
    (t) => t.status === 'en_attente_validation' || t.status === 'valide'
  );

  const scopeLabel = isGlobal
    ? 'Réseau Global Ets AMANI (Toutes Agences)'
    : `Agence ${user.agencyId || 'Locale'}`;

  return [
    `📊 **Synthèse Analytique Temps Réel — ${scopeLabel}**`,
    `• **Trésorerie Billetage** : $${usdCaisse.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} USD et ${cdfCaisse.toLocaleString('fr-FR')} CDF (${myBilletages.length} arrêté(s), ${discrepancyCount} écart(s) signalé(s)).`,
    `• **Missions & Opérations** : ${pendingOps.length} opération(s) active(s) en cours sur ${myOps.length} enregistrée(s) • ${mySms.length} flux SMS Mobile Money captés.`,
    `• **Portefeuille Dettes & Créances** : ${myDebts.length} dossier(s) actifs pour un reste à recouvrer de $${debtUSD.toLocaleString('fr-FR')} USD et ${debtCDF.toLocaleString('fr-FR')} CDF.`,
    `• **Transferts Inter-Agences** : ${pendingTransfers.length} transfert(s) en cours de validation/réception sur ${myTransfers.length} mouvement(s).`,
    question.toLowerCase().includes('risque') || question.toLowerCase().includes('alerte')
      ? `⚠️ **Contrôle Interne** : ${discrepancyCount > 0 ? `${discrepancyCount} billetage(s) présentent un écart contradictoire à vérifier.` : 'Aucun écart de caisse critique détecté.'}`
      : `✅ Données certifiées depuis votre base locale Offline-First Dexie et synchronisées avec Firestore.`,
  ].join('\n');
}

/* =========================================================
   2. DIFFUSIONS ADMINISTRATIVES & ANNONCES (BROADCASTS)
   ========================================================= */

export async function getAuthorizedBroadcasts(
  user: AppUser | null
): Promise<LocalBroadcast[]> {
  if (!user) return [];
  const all = await db.broadcasts.toArray();
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const visible = all.filter((b) => {
    if (b.scope === 'global') return true;
    if (isGlobal) return true;
    return user.agencyId && b.agencyId === user.agencyId;
  });

  return visible.sort((a, b) => b.createdAt - a.createdAt);
}

export interface CreateBroadcastInput {
  title: string;
  message: string;
  severity: LocalBroadcast['severity'];
  scope: LocalBroadcast['scope'];
  agencyId: string | null;
  agencyName?: string | null;
  requiresAck: boolean;
  requiresReadConfirmation: boolean;
  blockingUntilAck: boolean;
}

export async function createBroadcast(
  input: CreateBroadcastInput,
  user: AppUser
): Promise<LocalBroadcast> {
  const now = Date.now();
  const id = `bc-${now}-${Math.random().toString(36).substring(2, 8)}`;

  const isGlobalRole =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const effectiveScope: LocalBroadcast['scope'] = isGlobalRole
    ? input.scope
    : 'agence';
  const effectiveAgencyId =
    effectiveScope === 'global'
      ? null
      : isGlobalRole
        ? input.agencyId
        : user.agencyId || null;

  const bc: LocalBroadcast = {
    id,
    title: input.title.trim(),
    message: input.message.trim(),
    severity: input.severity,
    scope: effectiveScope,
    agencyId: effectiveAgencyId,
    agencyName: input.agencyName || (effectiveAgencyId ? effectiveAgencyId : 'Réseau Global'),
    requiresAck: input.requiresAck,
    requiresReadConfirmation: input.requiresReadConfirmation,
    blockingUntilAck: input.blockingUntilAck,
    acknowledgedBy: [user.uid],
    readBy: [user.uid],
    authorId: user.uid,
    authorName: user.displayName || 'Direction',
    authorRole: user.role,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.broadcasts.put(bc);
  await db.syncQueue.add({
    entity: 'broadcast',
    entityId: id,
    operation: 'create',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Diffusion annonce officielle',
    category: 'operations',
    severity: input.severity === 'critique' ? 'critical' : 'info',
    details: `Annonce « ${bc.title} » (${bc.severity}) diffusée sur le périmètre ${bc.agencyName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: { broadcastId: id, scope: effectiveScope, agencyId: effectiveAgencyId },
  });

  return bc;
}

export async function acknowledgeBroadcast(
  broadcastId: string,
  user: AppUser
): Promise<void> {
  const existing = await db.broadcasts.get(broadcastId);
  if (!existing) return;

  const nextAck = Array.from(new Set([...(existing.acknowledgedBy || []), user.uid]));
  const nextRead = Array.from(new Set([...(existing.readBy || []), user.uid]));
  const now = Date.now();

  await db.broadcasts.update(broadcastId, {
    acknowledgedBy: nextAck,
    readBy: nextRead,
    syncStatus: 'pending',
    updatedAt: now,
  });

  await db.syncQueue.add({
    entity: 'broadcast',
    entityId: broadcastId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

/* =========================================================
   3. SUIVI DES DETTES & REMBOURSEMENTS (DEBTS)
   ========================================================= */

export async function getAuthorizedDebts(
  user: AppUser | null
): Promise<LocalDebt[]> {
  if (!user) return [];
  const all = await db.debts.toArray();
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const visible = isGlobal
    ? all
    : all.filter((d) => user.agencyId && d.agencyId === user.agencyId);

  return visible.sort((a, b) => b.createdAt - a.createdAt);
}

export interface CreateDebtInput {
  category: LocalDebt['category'];
  debtorName: string;
  debtorPhone?: string;
  agencyId: string;
  agencyName: string;
  currency: 'USD' | 'CDF';
  initialAmount: number;
  reason: string;
  dueDate: number;
}

export async function createDebtRecord(
  input: CreateDebtInput,
  user: AppUser
): Promise<LocalDebt> {
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';
  const enforcedAgencyId = isGlobal ? input.agencyId : user.agencyId || input.agencyId;

  const now = Date.now();
  const id = `debt-${now}-${Math.random().toString(36).substring(2, 7)}`;
  const reference = `DET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const debt: LocalDebt = {
    id,
    reference,
    category: input.category,
    debtorName: input.debtorName.trim(),
    debtorPhone: input.debtorPhone?.trim() || null,
    agencyId: enforcedAgencyId,
    agencyName: input.agencyName,
    currency: input.currency,
    initialAmount: Number(input.initialAmount),
    remainingAmount: Number(input.initialAmount),
    reason: input.reason.trim(),
    dueDate: input.dueDate,
    status: input.dueDate < now ? 'en_retard' : 'en_cours',
    repayments: [],
    createdBy: user.uid,
    createdByName: user.displayName || 'Utilisateur',
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.debts.put(debt);
  await db.syncQueue.add({
    entity: 'debt',
    entityId: id,
    operation: 'create',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Enregistrement de dette / créance',
    category: 'operations',
    severity: 'warning',
    details: `Dette ${reference} enregistrée pour ${debt.debtorName} (${debt.initialAmount} ${debt.currency}) — Agence ${debt.agencyName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: { debtId: id, reference, amount: debt.initialAmount, currency: debt.currency },
  });

  return debt;
}

export async function recordDebtRepayment(
  debtId: string,
  amount: number,
  note: string,
  user: AppUser
): Promise<LocalDebt> {
  const existing = await db.debts.get(debtId);
  if (!existing) throw new Error('Dossier de dette introuvable.');

  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';
  if (!isGlobal && existing.agencyId !== user.agencyId) {
    throw new Error('Violation RBAC : cette dette appartient à une autre agence.');
  }

  const cleanAmount = Math.max(0, Number(amount));
  const nextRemaining = Math.max(0, existing.remainingAmount - cleanAmount);
  const now = Date.now();

  const nextStatus: LocalDebt['status'] =
    nextRemaining <= 0
      ? 'rembourse'
      : existing.dueDate < now
        ? 'en_retard'
        : 'partiel';

  const repayment = {
    id: `rep-${now}-${Math.random().toString(36).substring(2, 6)}`,
    amount: cleanAmount,
    currency: existing.currency,
    recordedBy: user.uid,
    recordedByName: user.displayName || 'Utilisateur',
    note: note.trim(),
    timestamp: now,
  };

  const updated: LocalDebt = {
    ...existing,
    remainingAmount: nextRemaining,
    status: nextStatus,
    repayments: [...(existing.repayments || []), repayment],
    syncStatus: 'pending',
    updatedAt: now,
  };

  await db.debts.put(updated);
  await db.syncQueue.add({
    entity: 'debt',
    entityId: debtId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Remboursement sur dette',
    category: 'operations',
    severity: 'info',
    details: `Remboursement de ${cleanAmount} ${existing.currency} sur ${existing.reference} (${existing.debtorName}). Reste : ${nextRemaining} ${existing.currency}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: { debtId, reference: existing.reference, paid: cleanAmount, remaining: nextRemaining },
  });

  return updated;
}

/* =========================================================
   4. TRANSFERTS INTER-AGENCES (INTER-AGENCY TRANSFERS)
   ========================================================= */

export async function getAuthorizedTransfers(
  user: AppUser | null
): Promise<LocalInterAgencyTransfer[]> {
  if (!user) return [];
  const all = await db.interAgencyTransfers.toArray();
  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const visible = isGlobal
    ? all
    : all.filter(
        (t) =>
          user.agencyId &&
          (t.sourceAgencyId === user.agencyId || t.targetAgencyId === user.agencyId)
      );

  return visible.sort((a, b) => b.createdAt - a.createdAt);
}

export interface CreateTransferInput {
  transferType: LocalInterAgencyTransfer['transferType'];
  sourceAgencyId: string;
  sourceAgencyName: string;
  targetAgencyId: string;
  targetAgencyName: string;
  amount: number;
  currency: 'USD' | 'CDF';
  operatorOrChannel?: string;
  reason: string;
}

export async function initiateInterAgencyTransfer(
  input: CreateTransferInput,
  user: AppUser
): Promise<LocalInterAgencyTransfer> {
  if (input.sourceAgencyId === input.targetAgencyId) {
    throw new Error("L'agence source et l'agence destinataire doivent être distinctes.");
  }

  const now = Date.now();
  const id = `trf-${now}-${Math.random().toString(36).substring(2, 7)}`;
  const reference = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const isGlobal =
    user.role === 'administrateur_systeme' || user.role === 'directeur_general';

  const trf: LocalInterAgencyTransfer = {
    id,
    reference,
    transferType: input.transferType,
    sourceAgencyId: input.sourceAgencyId,
    sourceAgencyName: input.sourceAgencyName,
    targetAgencyId: input.targetAgencyId,
    targetAgencyName: input.targetAgencyName,
    amount: Number(input.amount),
    currency: input.currency,
    operatorOrChannel: input.operatorOrChannel?.trim() || 'Caisse / Convoyage Interne',
    reason: input.reason.trim(),
    status: isGlobal ? 'valide' : 'en_attente_validation',
    initiatedBy: user.uid,
    initiatedByName: user.displayName || 'Utilisateur',
    initiatedByRole: user.role,
    validatedBy: isGlobal ? user.uid : null,
    validatedByName: isGlobal ? user.displayName || 'Direction' : null,
    validatedAt: isGlobal ? now : null,
    receivedBy: null,
    receivedByName: null,
    receivedAt: null,
    rejectionReason: null,
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await db.interAgencyTransfers.put(trf);
  await db.syncQueue.add({
    entity: 'interAgencyTransfer',
    entityId: id,
    operation: 'create',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: 'Initiation transfert inter-agences',
    category: 'operations',
    severity: 'warning',
    details: `Transfert ${reference} (${trf.amount} ${trf.currency}) de ${trf.sourceAgencyName} vers ${trf.targetAgencyName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: { transferId: id, reference, amount: trf.amount, currency: trf.currency },
  });

  return trf;
}

export async function updateInterAgencyTransferStatus(
  transferId: string,
  nextStatus: 'valide' | 'recu' | 'rejete',
  user: AppUser,
  rejectionReason?: string
): Promise<LocalInterAgencyTransfer> {
  const existing = await db.interAgencyTransfers.get(transferId);
  if (!existing) throw new Error('Transfert introuvable.');

  const now = Date.now();
  const patch: Partial<LocalInterAgencyTransfer> = {
    status: nextStatus,
    syncStatus: 'pending',
    updatedAt: now,
  };

  if (nextStatus === 'valide') {
    patch.validatedBy = user.uid;
    patch.validatedByName = user.displayName || 'Direction';
    patch.validatedAt = now;
  } else if (nextStatus === 'recu') {
    patch.receivedBy = user.uid;
    patch.receivedByName = user.displayName || 'Réceptionnaire';
    patch.receivedAt = now;
  } else if (nextStatus === 'rejete') {
    patch.rejectionReason = rejectionReason || 'Rejeté par le contrôle interne';
  }

  const updated: LocalInterAgencyTransfer = {
    ...existing,
    ...patch,
  };

  await db.interAgencyTransfers.put(updated);
  await db.syncQueue.add({
    entity: 'interAgencyTransfer',
    entityId: transferId,
    operation: 'update',
    attempts: 0,
    lastError: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditLog({
    action: `Transfert inter-agences : ${nextStatus}`,
    category: 'operations',
    severity: nextStatus === 'rejete' ? 'critical' : 'info',
    details: `Transfert ${existing.reference} (${existing.amount} ${existing.currency}) marqué « ${nextStatus} » par ${user.displayName}.`,
    actorName: user.displayName || 'Utilisateur',
    actorRole: user.role,
    actorUid: user.uid,
    metadata: { transferId, reference: existing.reference, status: nextStatus },
  });

  return updated;
}
