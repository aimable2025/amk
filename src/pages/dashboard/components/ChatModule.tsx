import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CornerUpRight,
  Download,
  Edit2,
  FileText,
  Filter,
  Globe,
  Hash,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  MoreVertical,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  Share2,
  Smile,
  SmilePlus,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import type { LocalBroadcast, LocalChatMessage } from '../../../lib/db';
import { getAgencies, type Agency } from '../../../services/AgencyService';
import { getAllSystemUsers, type ManagedUser } from '../../../services/SystemUserService';
import {
  acknowledgeBroadcast,
  addChatMessageComment,
  createBroadcast,
  deleteChatMessage,
  editChatMessage,
  getAuthorizedBroadcasts,
  getAuthorizedChatMessages,
  markChatMessageAsRead,
  retrySendChatMessage,
  sendChatMessage,
  subscribeToChatMessagesRealtime,
  toggleChatMessageReaction,
} from '../../../services/EnterpriseOperationsService';
import { triggerSyncNow } from '../../../services/SyncWorker';
import ChatEmojiPicker from '../../../components/common/ChatEmojiPicker';

interface ChatModuleProps {
  onClose?: () => void;
  initialTarget?: import('../../../components/common/HeaderChatSearch').ChatNavigationTarget;
  initialSearchQuery?: string;
}

type ActiveTab = 'chat' | 'broadcasts';
type ChatFilterType = 'all' | 'unread' | 'prive' | 'groupe' | 'service' | 'agence';

const QUICK_REACTIONS = ['👍', '❤️', '✅', '🙏', '🔥', '⚠️'] as const;

const ETS_SERVICES = [
  { id: 'guichetier', label: 'Guichet & Caisse', code: 'CAISSE' },
  { id: 'comptable', label: 'Comptabilité & Audit', code: 'COMPTA' },
  { id: 'agent_operateur_mobile', label: 'Flotte & Mobile Money', code: 'M-MONEY' },
  { id: 'agent_change', label: 'Change USD / CDF', code: 'CHANGE' },
  { id: 'agent_terrain', label: 'Opérations Terrain', code: 'TERRAIN' },
  { id: 'service_paie', label: 'Service Paie & Salaires', code: 'PAIE' },
  { id: 'administration_agence', label: 'Administration Agence', code: 'ADM-AG' },
  { id: 'direction_generale', label: 'Direction Générale', code: 'DG' },
] as const;

interface CustomChatGroup {
  id: string;
  name: string;
  participantIds: string[];
  participantNames: string[];
}

interface ConversationListItem {
  id: string;
  type: LocalChatMessage['channelType'];
  name: string;
  subtitle: string;
  icon: typeof Globe;
  unread: number;
  lastMessage?: LocalChatMessage;
  timestamp: number;
  isActive: boolean;
  groupId?: string;
  serviceId?: string;
  userId?: string;
}

const DEFAULT_GROUPS: CustomChatGroup[] = [
  {
    id: 'grp-coordination',
    name: 'Coordination Direction & Agences',
    participantIds: [],
    participantNames: ['Direction Générale', 'Coordinateurs Agences'],
  },
  {
    id: 'grp-tresorerie',
    name: 'Équipe Trésorerie & Billetage',
    participantIds: [],
    participantNames: ['Caissiers', 'Guichetiers', 'Comptabilité'],
  },
  {
    id: 'grp-mobile-money',
    name: 'Opérateurs Flotte & Mobile Money',
    participantIds: [],
    participantNames: ['Opérateurs Mobile', 'Superviseurs SMS'],
  },
];

const CUSTOM_GROUPS_STORAGE_KEY = 'ets_amani_custom_chat_groups_v1';

function loadSavedGroups(): CustomChatGroup[] {
  if (typeof window === 'undefined') return DEFAULT_GROUPS;
  try {
    const raw = window.localStorage.getItem(CUSTOM_GROUPS_STORAGE_KEY);
    if (!raw) return DEFAULT_GROUPS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_GROUPS;
    return [...DEFAULT_GROUPS, ...parsed];
  } catch {
    return DEFAULT_GROUPS;
  }
}

// Générateur de couleur déterministe pour les avatars WhatsApp
function getAvatarBgColor(name: string): string {
  const colors = [
    'bg-emerald-600',
    'bg-teal-600',
    'bg-blue-600',
    'bg-indigo-600',
    'bg-purple-600',
    'bg-rose-600',
    'bg-amber-600',
    'bg-cyan-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  if (!name) return 'EA';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatChatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Hier';
  }

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export default function ChatModule({
  onClose,
  initialTarget,
  initialSearchQuery,
}: ChatModuleProps) {
  const { user } = useAuth();
  const isGlobalRole =
    user?.role === 'administrateur_systeme' || user?.role === 'directeur_general';
  const canBroadcast = isGlobalRole || user?.role === 'administrateur_agence';

  // Vérifier s'il y a une cible stockée en session par la recherche globale
  const savedTarget = useMemo(() => {
    if (initialTarget) return initialTarget;
    try {
      const raw = window.sessionStorage.getItem('ets_amani_chat_active_target');
      if (raw) {
        window.sessionStorage.removeItem('ets_amani_chat_active_target');
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    return null;
  }, [initialTarget]);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const tab = window.sessionStorage.getItem('ets_amani_chat_open_tab');
      if (tab === 'broadcasts') {
        window.sessionStorage.removeItem('ets_amani_chat_open_tab');
        return 'broadcasts';
      }
    } catch {
      // ignore
    }
    return 'chat';
  });
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [broadcasts, setBroadcasts] = useState<LocalBroadcast[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);

  // Navigation WhatsApp : vue mobile ('list' ou 'conversation')
  const [mobilePane, setMobilePane] = useState<'list' | 'conversation'>(
    savedTarget ? 'conversation' : 'list'
  );

  // Filtre rapide WhatsApp
  const [listFilter, setListFilter] = useState<ChatFilterType>('all');
  const [conversationSearchQuery, setConversationSearchQuery] = useState(
    initialSearchQuery || ''
  );

  // Sélection du canal / conversation active
  const [channelType, setChannelType] = useState<LocalChatMessage['channelType']>(
    savedTarget?.channelType || 'global'
  );
  const [selectedServiceTag, setSelectedServiceTag] = useState<string>(
    savedTarget?.serviceId || 'guichetier'
  );
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(
    savedTarget?.userId || ''
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    savedTarget?.groupId || 'grp-coordination'
  );

  // Groupes
  const [groups, setGroups] = useState<CustomChatGroup[]>(loadSavedGroups);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([]);

  // Rédaction et message
  const [messageText, setMessageText] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<'none' | 'image' | 'document'>('none');
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string | null>(null);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [showSearchInChat, setShowSearchInChat] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<LocalChatMessage | null>(null);
  const [openReactionPickerMsgId, setOpenReactionPickerMsgId] = useState<string | null>(null);
  const [openCommentsMsgIds, setOpenCommentsMsgIds] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [sharingMessage, setSharingMessage] = useState<LocalChatMessage | null>(null);
  const [shareTargetType, setShareTargetType] =
    useState<LocalChatMessage['channelType']>('prive');
  const [shareRecipientId, setShareRecipientId] = useState<string>('');
  const [shareServiceTag, setShareServiceTag] = useState<string>('guichetier');
  const [shareGroupId, setShareGroupId] = useState<string>('grp-coordination');
  const [shareNote, setShareNote] = useState<string>('');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Diffusions
  const [showBroadcastForm, setShowBroadcastForm] = useState(false);
  const [bcTitle, setBcTitle] = useState('');
  const [bcMessage, setBcMessage] = useState('');
  const [bcSeverity, setBcSeverity] = useState<LocalBroadcast['severity']>('important');
  const [bcScope, setBcScope] = useState<LocalBroadcast['scope']>(
    isGlobalRole ? 'global' : 'agence'
  );
  const [bcAgencyId, setBcAgencyId] = useState<string>(user?.agencyId || '');
  const [bcRequiresAck, setBcRequiresAck] = useState(true);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast((cur) => (cur === msg ? null : cur));
    }, 3200);
  };

  const loadAll = async () => {
    if (!user) return;
    try {
      const [msgs, bcs, ags, usrs] = await Promise.all([
        getAuthorizedChatMessages(user),
        getAuthorizedBroadcasts(user),
        getAgencies(),
        getAllSystemUsers(),
      ]);
      setMessages(msgs);
      setBroadcasts(bcs);
      setAgencies(ags);
      setUsersList(usrs.filter((u) => u.uid !== user.uid));
    } catch {
      // Ignoré en mode offline
    }
  };

  // Synchronisation temps-réel avec abonnement Firestore et nettoyage
  useEffect(() => {
    void loadAll();
    const unsub = subscribeToChatMessagesRealtime(user, () => {
      void loadAll();
    });
    const interval = setInterval(loadAll, 10000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [user?.uid, user?.agencyId]);

  // Écoute des événements de navigation depuis la barre de recherche globale du tableau de bord
  useEffect(() => {
    const handleCustomNavigate = (e: Event) => {
      const customEvt = e as CustomEvent<import('../../../components/common/HeaderChatSearch').ChatNavigationTarget>;
      const target = customEvt.detail;
      if (!target) return;
      setActiveTab('chat');
      setChannelType(target.channelType);
      if (target.groupId) setSelectedGroupId(target.groupId);
      if (target.serviceId) setSelectedServiceTag(target.serviceId);
      if (target.userId) setSelectedRecipientId(target.userId);
      setMobilePane('conversation');
    };

    const handleCustomTab = (e: Event) => {
      const customEvt = e as CustomEvent<string>;
      if (customEvt.detail === 'broadcasts') {
        setActiveTab('broadcasts');
      } else {
        setActiveTab('chat');
      }
    };

    window.addEventListener('ets-amani-navigate-chat', handleCustomNavigate);
    window.addEventListener('ets-amani-chat-tab', handleCustomTab);
    return () => {
      window.removeEventListener('ets-amani-navigate-chat', handleCustomNavigate);
      window.removeEventListener('ets-amani-chat-tab', handleCustomTab);
    };
  }, []);

  const activeGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || groups[0],
    [groups, selectedGroupId]
  );

  const activeService = useMemo(
    () => ETS_SERVICES.find((s) => s.id === selectedServiceTag) || ETS_SERVICES[0],
    [selectedServiceTag]
  );

  const activeRecipientUser = useMemo(
    () => usersList.find((u) => u.uid === selectedRecipientId),
    [usersList, selectedRecipientId]
  );

  const currentChannelId = useMemo(() => {
    if (channelType === 'global') return 'channel-global';
    if (channelType === 'agence') return `channel-agency-${user?.agencyId || 'centrale'}`;
    if (channelType === 'groupe') return `channel-group-${activeGroup?.id || 'coordination'}`;
    if (channelType === 'service') return `channel-service-${selectedServiceTag}`;
    if (channelType === 'prive') {
      const ids = [user?.uid || '', selectedRecipientId || 'none'].sort();
      return `channel-dm-${ids.join('-')}`;
    }
    return 'channel-global';
  }, [channelType, user?.agencyId, user?.uid, activeGroup, selectedServiceTag, selectedRecipientId]);

  const currentChannelName = useMemo(() => {
    if (channelType === 'global') return 'Réseau Général Ets AMANI';
    if (channelType === 'agence') return `Agence Locale (${user?.agencyId || 'Centrale'})`;
    if (channelType === 'groupe') return activeGroup?.name || 'Groupe de coordination';
    if (channelType === 'service') return `Service : ${activeService.label}`;
    if (channelType === 'prive') {
      return activeRecipientUser
        ? activeRecipientUser.displayName
        : 'Discussion Privée';
    }
    return 'Messagerie Ets AMANI';
  }, [channelType, user?.agencyId, activeGroup, activeService, activeRecipientUser]);

  const currentChannelSubtitle = useMemo(() => {
    if (channelType === 'global') return 'Tous les collaborateurs & agences connectés';
    if (channelType === 'agence') return `Membres de l'agence ${user?.agencyId || 'Centrale'}`;
    if (channelType === 'groupe') {
      return activeGroup?.participantNames.length
        ? activeGroup.participantNames.join(', ')
        : 'Groupe de travail';
    }
    if (channelType === 'service') return `#${activeService.code} • Équipe opérationnelle`;
    if (channelType === 'prive') {
      return activeRecipientUser
        ? `${activeRecipientUser.function || activeRecipientUser.role} • ${activeRecipientUser.agencyId || 'Centrale'}`
        : 'Sélectionnez un collègue';
    }
    return 'Ets AMANI WhatsApp Interne';
  }, [channelType, user?.agencyId, activeGroup, activeService, activeRecipientUser]);

  // Statistiques de non-lus
  const unreadStats = useMemo(() => {
    if (!user) {
      return {
        total: 0,
        byType: { prive: 0, service: 0, groupe: 0, agence: 0, global: 0 },
        byUser: {} as Record<string, number>,
        byService: {} as Record<string, number>,
        byGroup: {} as Record<string, number>,
      };
    }

    let total = 0;
    const byType = { prive: 0, service: 0, groupe: 0, agence: 0, global: 0 };
    const byUser: Record<string, number> = {};
    const byService: Record<string, number> = {};
    const byGroup: Record<string, number> = {};

    messages.forEach((m) => {
      if (m.senderId === user.uid || m.readBy?.includes(user.uid)) {
        return;
      }

      total++;
      if (m.channelType in byType) {
        byType[m.channelType]++;
      }

      if (m.channelType === 'prive') {
        const otherId = m.senderId;
        byUser[otherId] = (byUser[otherId] || 0) + 1;
      } else if (m.channelType === 'service' && m.serviceTag) {
        byService[m.serviceTag] = (byService[m.serviceTag] || 0) + 1;
      } else if (m.channelType === 'groupe') {
        const grp = groups.find(
          (g) => g.id === m.channelId.replace('channel-group-', '') || g.name === m.groupName
        );
        if (grp) {
          byGroup[grp.id] = (byGroup[grp.id] || 0) + 1;
        }
      }
    });

    return { total, byType, byUser, byService, byGroup };
  }, [messages, user, groups]);

  // Messages du canal courant dédupliqués et triés
  const channelMessages = useMemo(() => {
    const raw = messages.filter((m) => {
      if (channelType === 'global') return m.channelType === 'global';
      if (channelType === 'agence') return m.channelType === 'agence';
      if (channelType === 'groupe') {
        if (m.channelType !== 'groupe') return false;
        if (
          activeGroup?.id === 'grp-coordination' &&
          m.channelId === 'channel-direction-coordinateurs'
        ) {
          return true;
        }
        return m.channelId === currentChannelId || m.groupName === activeGroup?.name;
      }
      if (channelType === 'service') {
        return (
          m.channelType === 'service' &&
          (!m.serviceTag || m.serviceTag === selectedServiceTag)
        );
      }
      if (channelType === 'prive') {
        if (!selectedRecipientId) return m.channelType === 'prive';
        return (
          m.channelType === 'prive' &&
          ((m.senderId === user?.uid && m.recipientId === selectedRecipientId) ||
            (m.senderId === selectedRecipientId && m.recipientId === user?.uid))
        );
      }
      return true;
    });

    const seen = new Set<string>();
    const deduped: LocalChatMessage[] = [];
    for (const m of raw) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        deduped.push(m);
      }
    }
    return deduped.sort((a, b) => a.createdAt - b.createdAt);
  }, [
    messages,
    channelType,
    selectedServiceTag,
    selectedRecipientId,
    user?.uid,
    activeGroup,
    currentChannelId,
  ]);

  // Recherche dans la discussion courante
  const searchedChannelMessages = useMemo(() => {
    if (!chatSearchQuery.trim()) return channelMessages;
    const q = chatSearchQuery.toLowerCase();
    return channelMessages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.senderName.toLowerCase().includes(q) ||
        (m.attachmentName && m.attachmentName.toLowerCase().includes(q))
    );
  }, [channelMessages, chatSearchQuery]);

  // Marquer comme lus les messages du canal affiché (mise à jour DB + state local optimiste)
  useEffect(() => {
    if (!user) return;
    let didMark = false;
    channelMessages.forEach((m) => {
      if (!m.readBy?.includes(user.uid)) {
        didMark = true;
        void markChatMessageAsRead(m.id, user.uid);
      }
    });

    if (didMark) {
      setMessages((prev) =>
        prev.map((m) => {
          if (
            channelMessages.some((cm) => cm.id === m.id) &&
            !m.readBy?.includes(user.uid)
          ) {
            return {
              ...m,
              readBy: [...(m.readBy || []), user.uid],
            };
          }
          return m;
        })
      );
    }
  }, [channelMessages, user]);

  // Faire défiler automatiquement vers le bas
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length]);

  // Liste globale des discussions dans le panneau de gauche (style WhatsApp)
  const conversationListItems = useMemo(() => {
    // 1. Canal Global Réseau
    const globalLast = messages
      .filter((m) => m.channelType === 'global')
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    // 2. Canal Agence
    const agencyLast = messages
      .filter((m) => m.channelType === 'agence')
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    const items: ConversationListItem[] = [
      {
        id: 'global',
        type: 'global',
        name: 'Réseau Général Ets AMANI',
        subtitle: 'Canal entreprise tous services',
        icon: Globe,
        unread: unreadStats.byType.global || 0,
        lastMessage: globalLast,
        timestamp: globalLast?.createdAt || 0,
        isActive: channelType === 'global',
      },
      {
        id: 'agence',
        type: 'agence',
        name: `Canal Agence (${user?.agencyId || 'Locale'})`,
        subtitle: 'Équipe de mon agence',
        icon: Building2,
        unread: unreadStats.byType.agence || 0,
        lastMessage: agencyLast,
        timestamp: agencyLast?.createdAt || 0,
        isActive: channelType === 'agence',
      },
    ];

    // 3. Groupes
    groups.forEach((grp) => {
      const grpLast = messages
        .filter(
          (m) =>
            m.channelType === 'groupe' &&
            (m.channelId === `channel-group-${grp.id}` || m.groupName === grp.name)
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];

      items.push({
        id: `groupe-${grp.id}`,
        type: 'groupe',
        groupId: grp.id,
        name: grp.name,
        subtitle: grp.participantNames.join(', '),
        icon: Users,
        unread: unreadStats.byGroup[grp.id] || 0,
        lastMessage: grpLast,
        timestamp: grpLast?.createdAt || 0,
        isActive: channelType === 'groupe' && selectedGroupId === grp.id,
      });
    });

    // 4. Services
    ETS_SERVICES.forEach((srv) => {
      const srvLast = messages
        .filter((m) => m.channelType === 'service' && m.serviceTag === srv.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0];

      items.push({
        id: `service-${srv.id}`,
        type: 'service',
        serviceId: srv.id,
        name: srv.label,
        subtitle: `Service #${srv.code}`,
        icon: Hash,
        unread: unreadStats.byService[srv.id] || 0,
        lastMessage: srvLast,
        timestamp: srvLast?.createdAt || 0,
        isActive: channelType === 'service' && selectedServiceTag === srv.id,
      });
    });

    // 5. Contacts privés
    usersList.forEach((u) => {
      const userLast = messages
        .filter(
          (m) =>
            m.channelType === 'prive' &&
            ((m.senderId === user?.uid && m.recipientId === u.uid) ||
              (m.senderId === u.uid && m.recipientId === user?.uid))
        )
        .sort((a, b) => b.createdAt - a.createdAt)[0];

      items.push({
        id: `prive-${u.uid}`,
        type: 'prive',
        userId: u.uid,
        name: u.displayName || u.email || 'Collaborateur',
        subtitle: `${u.function || u.role} • ${u.agencyId || 'Centrale'}`,
        icon: Lock,
        unread: unreadStats.byUser[u.uid] || 0,
        lastMessage: userLast,
        timestamp: userLast?.createdAt || 0,
        isActive: channelType === 'prive' && selectedRecipientId === u.uid,
      });
    });

    // Filtre par catégorie WhatsApp
    let filtered = items;
    if (listFilter === 'unread') {
      filtered = filtered.filter((i) => i.unread > 0);
    } else if (listFilter !== 'all') {
      filtered = filtered.filter((i) => i.type === listFilter);
    }

    // Filtre de recherche WhatsApp
    if (conversationSearchQuery.trim()) {
      const q = conversationSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.subtitle.toLowerCase().includes(q) ||
          (i.lastMessage?.content && i.lastMessage.content.toLowerCase().includes(q))
      );
    }

    // Tri WhatsApp : les plus récents en premier
    return filtered.sort((a, b) => {
      if (a.unread > 0 && b.unread === 0) return -1;
      if (b.unread > 0 && a.unread === 0) return 1;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }, [
    messages,
    user,
    groups,
    usersList,
    channelType,
    selectedGroupId,
    selectedServiceTag,
    selectedRecipientId,
    unreadStats,
    listFilter,
    conversationSearchQuery,
  ]);

  const selectConversation = (item: ConversationListItem) => {
    setChannelType(item.type);
    if (item.type === 'groupe' && item.groupId) {
      setSelectedGroupId(item.groupId);
    } else if (item.type === 'service' && item.serviceId) {
      setSelectedServiceTag(item.serviceId);
    } else if (item.type === 'prive' && item.userId) {
      setSelectedRecipientId(item.userId);
    }
    // Sur mobile, basculer sur la vue discussion (comme sur WhatsApp Android)
    setMobilePane('conversation');
  };

  const handleCreateCustomGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;
    const selectedUsers = usersList.filter((u) => newGroupMemberIds.includes(u.uid));
    const participantIds = Array.from(new Set([user.uid, ...selectedUsers.map((u) => u.uid)]));
    const participantNames = [
      user.displayName || 'Moi',
      ...selectedUsers.map((u) => u.displayName || u.email || 'Membre'),
    ];
    const customGroup: CustomChatGroup = {
      id: `grp-${Date.now()}`,
      name: newGroupName.trim(),
      participantIds,
      participantNames,
    };

    const existingCustom = groups.filter(
      (g) => !DEFAULT_GROUPS.some((dg) => dg.id === g.id)
    );
    const updatedCustom = [...existingCustom, customGroup];
    try {
      window.localStorage.setItem(CUSTOM_GROUPS_STORAGE_KEY, JSON.stringify(updatedCustom));
    } catch {
      // ignore
    }
    setGroups([...DEFAULT_GROUPS, ...updatedCustom]);
    setSelectedGroupId(customGroup.id);
    setChannelType('groupe');
    setNewGroupName('');
    setNewGroupMemberIds([]);
    setShowCreateGroupModal(false);
    setMobilePane('conversation');
    showToast(`Groupe « ${customGroup.name} » créé.`);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      showToast('Fichier trop lourd : limite de 2,5 Mo.');
      e.target.value = '';
      return;
    }
    const isImg = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAttachmentName(file.name);
      setAttachmentType(isImg ? 'image' : 'document');
      setAttachmentDataUrl(dataUrl);
      showToast(`Pièce « ${file.name} » prête à être envoyée.`);
    };
    reader.onerror = () => {
      showToast('Impossible de lire le fichier sélectionné.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!messageText.trim() && !attachmentDataUrl)) return;
    if (channelType === 'prive' && !selectedRecipientId) {
      showToast('Veuillez sélectionner un destinataire.');
      return;
    }

    setSending(true);
    try {
      const recipient = usersList.find((u) => u.uid === selectedRecipientId);
      const sentMsg = await sendChatMessage(
        {
          channelType,
          channelId: currentChannelId,
          channelName: currentChannelName,
          agencyId:
            channelType === 'agence' || channelType === 'service'
              ? user.agencyId || null
              : null,
          recipientId: channelType === 'prive' ? selectedRecipientId || null : null,
          recipientName:
            channelType === 'prive' ? recipient?.displayName || null : null,
          serviceTag: channelType === 'service' ? selectedServiceTag : null,
          groupName: channelType === 'groupe' ? activeGroup?.name || null : null,
          groupParticipantIds:
            channelType === 'groupe' ? activeGroup?.participantIds || [] : [],
          groupParticipantNames:
            channelType === 'groupe' ? activeGroup?.participantNames || [] : [],
          replyToMessageId: replyingTo?.id || null,
          replyToSenderName: replyingTo?.senderName || null,
          replyToExcerpt: replyingTo ? replyingTo.content.slice(0, 120) : null,
          content: messageText.trim() || (attachmentType === 'image' ? '📷 Photo' : '📄 Fichier'),
          attachmentType,
          attachmentName,
          attachmentDataUrl,
        },
        user
      );
      setMessageText('');
      setAttachmentName(null);
      setAttachmentType('none');
      setAttachmentDataUrl(null);
      setReplyingTo(null);
      await loadAll();
      if (sentMsg.syncStatus === 'synced') {
        showToast('Message transmis.');
      } else {
        showToast('Message stocké localement, synchronisation en cours...');
      }
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : "Erreur lors de l'envoi du message."
      );
    } finally {
      setSending(false);
    }
  };

  const handleStartEdit = (msg: LocalChatMessage) => {
    setEditingMessageId(msg.id);
    setEditingMessageText(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingMessageText('');
  };

  const handleConfirmEdit = async (messageId: string) => {
    if (!user || !editingMessageText.trim()) return;
    try {
      await editChatMessage(messageId, editingMessageText, user);
      setEditingMessageId(null);
      setEditingMessageText('');
      await loadAll();
      void triggerSyncNow();
      showToast('Message modifié.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur modification.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!user) return;
    try {
      await deleteChatMessage(messageId, user);
      setDeletingMessageId(null);
      await loadAll();
      void triggerSyncNow();
      showToast('Message supprimé.');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur suppression.');
    }
  };

  const handleRetryMessage = async (messageId: string) => {
    try {
      await retrySendChatMessage(messageId);
      await loadAll();
      void triggerSyncNow();
      showToast('Relance de synchronisation en cours.');
    } catch {
      showToast('Échec de la relance.');
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    await toggleChatMessageReaction(messageId, emoji, user.uid);
    setOpenReactionPickerMsgId(null);
    await loadAll();
    void triggerSyncNow();
  };

  const handleAddComment = async (messageId: string) => {
    if (!user) return;
    const text = (commentInputs[messageId] || '').trim();
    if (!text) return;
    await addChatMessageComment(messageId, text, user);
    setCommentInputs((prev) => ({ ...prev, [messageId]: '' }));
    setOpenCommentsMsgIds((prev) => ({ ...prev, [messageId]: true }));
    await loadAll();
    void triggerSyncNow();
  };

  const handleReplyToMessage = (msg: LocalChatMessage) => {
    setReplyingTo(msg);
    messageInputRef.current?.focus();
  };

  const handleInsertEmoji = (emoji: string) => {
    const input = messageInputRef.current;
    if (!input) {
      setMessageText((prev) => prev + emoji);
      return;
    }
    const start = input.selectionStart ?? messageText.length;
    const end = input.selectionEnd ?? messageText.length;
    const nextText = messageText.slice(0, start) + emoji + messageText.slice(end);
    setMessageText(nextText);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    }, 10);
  };

  const handleCopyMessage = async (msg: LocalChatMessage) => {
    const formatted = `[Ets AMANI • ${msg.senderName}] : ${msg.content}`;
    try {
      await navigator.clipboard.writeText(formatted);
      showToast('Copié dans le presse-papiers.');
    } catch {
      showToast('Message copié.');
    }
  };

  const handleConfirmForwardMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !sharingMessage) return;

    if (shareTargetType === 'prive' && !shareRecipientId) {
      showToast('Veuillez sélectionner un destinataire pour le transfert.');
      return;
    }

    const recipient = usersList.find((u) => u.uid === shareRecipientId);
    const targetGroup = groups.find((g) => g.id === shareGroupId) || groups[0];
    const targetService =
      ETS_SERVICES.find((s) => s.id === shareServiceTag)?.label || shareServiceTag;

    let targetChannelId = 'channel-global';
    let targetChannelName = 'Réseau Général Ets AMANI';
    if (shareTargetType === 'agence') {
      targetChannelId = `channel-agency-${user.agencyId || 'centrale'}`;
      targetChannelName = `Canal Agence (${user.agencyId || 'Locale'})`;
    } else if (shareTargetType === 'groupe') {
      targetChannelId = `channel-group-${targetGroup.id}`;
      targetChannelName = `Groupe : ${targetGroup.name}`;
    } else if (shareTargetType === 'service') {
      targetChannelId = `channel-service-${shareServiceTag}`;
      targetChannelName = `Service : ${targetService}`;
    } else if (shareTargetType === 'prive') {
      const ids = [user.uid, shareRecipientId].sort();
      targetChannelId = `channel-dm-${ids.join('-')}`;
      targetChannelName = `Destinataire : ${recipient?.displayName || 'Collaborateur'}`;
    }

    const forwardedContent = shareNote.trim()
      ? `${shareNote.trim()}\n\n— Transféré de ${sharingMessage.senderName} :\n« ${sharingMessage.content} »`
      : sharingMessage.content;

    const forwardedMsg = await sendChatMessage(
      {
        channelType: shareTargetType,
        channelId: targetChannelId,
        channelName: targetChannelName,
        agencyId: user.agencyId || null,
        recipientId: shareTargetType === 'prive' ? shareRecipientId : null,
        recipientName:
          shareTargetType === 'prive' ? recipient?.displayName || null : null,
        serviceTag: shareTargetType === 'service' ? shareServiceTag : null,
        groupName: shareTargetType === 'groupe' ? targetGroup.name : null,
        groupParticipantIds:
          shareTargetType === 'groupe' ? targetGroup.participantIds : [],
        groupParticipantNames:
          shareTargetType === 'groupe' ? targetGroup.participantNames : [],
        forwardedFromSenderName: sharingMessage.senderName,
        content: forwardedContent,
        attachmentType: sharingMessage.attachmentType || 'none',
        attachmentName: sharingMessage.attachmentName || null,
      },
      user
    );

    setSharingMessage(null);
    setShareNote('');
    await loadAll();
    if (forwardedMsg.syncStatus === 'synced') {
      showToast(`Transféré vers ${targetChannelName}.`);
    } else {
      showToast(`Enregistré localement, transfert en cours vers ${targetChannelName}...`);
    }
  };

  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !bcTitle.trim() || !bcMessage.trim()) return;
    const targetAg = agencies.find((a) => a.id === bcAgencyId);
    await createBroadcast(
      {
        title: bcTitle,
        message: bcMessage,
        severity: bcSeverity,
        scope: bcScope,
        agencyId: bcScope === 'global' ? null : bcAgencyId || user.agencyId || null,
        agencyName:
          bcScope === 'global'
            ? 'Réseau Global Ets AMANI'
            : targetAg?.name || user.agencyId || 'Agence Locale',
        requiresAck: bcRequiresAck,
        requiresReadConfirmation: true,
        blockingUntilAck: bcSeverity === 'critique',
      },
      user
    );
    setBcTitle('');
    setBcMessage('');
    setShowBroadcastForm(false);
    await loadAll();
    void triggerSyncNow();
    showToast('Diffusion officielle publiée.');
  };

  const handleAckBroadcast = async (bcId: string) => {
    if (!user) return;
    await acknowledgeBroadcast(bcId, user);
    await loadAll();
    void triggerSyncNow();
    showToast('Accusé de réception enregistré.');
  };

  const unacknowledgedCount = useMemo(() => {
    if (!user) return 0;
    return broadcasts.filter(
      (b) => b.requiresAck && !b.acknowledgedBy?.includes(user.uid)
    ).length;
  }, [broadcasts, user]);

  return (
    <div className="flex flex-col h-[760px] max-h-[88vh] rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden font-sans">
      {/* ========================================================================= */}
      {/* 1. BARRE SUPÉRIEURE PRINCIPALE (STYLE WHATSAPP ANDROID APP BAR)            */}
      {/* ========================================================================= */}
      <div className="bg-[#008069] text-white px-4 py-3 shrink-0 shadow-md flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white shadow-inner">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight leading-none text-white">
                Ets AMANI Chat
              </h1>
              <span className="rounded-md bg-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100 uppercase tracking-wider">
                Interne
              </span>
            </div>
            <p className="text-[11px] text-emerald-100/90 mt-0.5">
              Messagerie & Annonces Sécurisées • Offline & Temps-Réel
            </p>
          </div>
        </div>

        {/* Onglets WhatsApp Android : Discussions vs Annonces Officielles */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'chat'
                  ? 'bg-white text-[#008069] shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Discussions</span>
              {unreadStats.total > 0 && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                  {unreadStats.total}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('broadcasts')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'broadcasts'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Notes & Annonces</span>
              {unacknowledgedCount > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[10px] font-black text-white animate-pulse">
                  {unacknowledgedCount}
                </span>
              )}
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/10 p-2 text-white hover:bg-white/20 transition"
              title="Fermer le chat"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Toast de confirmation / notifications */}
      {feedbackToast && (
        <div className="flex items-center justify-between bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-900 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ONGLET PRINCIPAL : CHAT INTERNE DISCUSSIONS                            */}
      {/* ========================================================================= */}
      {activeTab === 'chat' && (
        <div className="flex flex-1 overflow-hidden relative">
          {/* ===================================================================== */}
          {/* PANNEAU GAUCHE : LISTE DES CONVERSATIONS (STYLE WHATSAPP ANDROID)      */}
          {/* ===================================================================== */}
          <div
            className={`w-full md:w-88 lg:w-96 border-r border-slate-200 bg-white flex flex-col shrink-0 ${
              mobilePane === 'conversation' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Barre de recherche dans les conversations */}
            <div className="p-3 border-b border-slate-100 bg-[#f0f2f5]/60 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={conversationSearchQuery}
                    onChange={(e) => setConversationSearchQuery(e.target.value)}
                    placeholder="Rechercher une discussion..."
                    className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#008069] focus:ring-1 focus:ring-[#008069]"
                  />
                  {conversationSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setConversationSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Bouton Nouvelle Discussion / Groupe (FAB WhatsApp) */}
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#008069] text-white hover:bg-[#006a57] transition shadow-xs"
                  title="Démarrer une discussion ou créer un groupe"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Filtres de catégories (Toutes, Non lues, Privé, Groupes, Services, Agence) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                {(
                  [
                    { id: 'all', label: 'Toutes' },
                    { id: 'unread', label: 'Non lues', count: unreadStats.total },
                    { id: 'prive', label: 'Privé' },
                    { id: 'groupe', label: 'Groupes' },
                    { id: 'service', label: 'Services' },
                    { id: 'agence', label: 'Agence' },
                  ] as const
                ).map((f) => {
                  const active = listFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setListFilter(f.id)}
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 font-semibold transition ${
                        active
                          ? 'bg-[#008069] text-white shadow-xs'
                          : 'bg-slate-200/70 text-slate-700 hover:bg-slate-300/70'
                      }`}
                    >
                      <span>{f.label}</span>
                      {'count' in f && Boolean(f.count) && (
                        <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.2 text-[9px] font-black">
                          {f.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Liste scrollable des conversations */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {conversationListItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">Aucune discussion trouvée</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Modifiez vos filtres ou lancez une nouvelle conversation.
                  </p>
                </div>
              ) : (
                conversationListItems.map((item) => {
                  const isCurrent = item.isActive;
                  const initials = getInitials(item.name);
                  const avatarColor = getAvatarBgColor(item.name);
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectConversation(item)}
                      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition select-none ${
                        isCurrent
                          ? 'bg-[#f0f2f5] border-l-4 border-[#008069]'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Avatar circulaire WhatsApp */}
                      <div className="relative shrink-0">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-full text-white font-bold text-sm shadow-xs ${avatarColor}`}
                        >
                          {initials}
                        </div>
                        {/* Indicateur de type (icône miniature) */}
                        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5 shadow-xs">
                          <Icon className="h-3 w-3 text-slate-600" />
                        </span>
                      </div>

                      {/* Corps de l'élément de conversation */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <h4
                            className={`truncate text-xs font-bold ${
                              isCurrent ? 'text-slate-900' : 'text-slate-800'
                            }`}
                          >
                            {item.name}
                          </h4>
                          {item.timestamp > 0 && (
                            <span
                              className={`text-[10px] shrink-0 ${
                                item.unread > 0
                                  ? 'font-bold text-[#008069]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {formatChatTime(item.timestamp)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-[11px] text-slate-500 flex items-center gap-1">
                            {item.lastMessage ? (
                              <>
                                {item.lastMessage.senderId === user?.uid && (
                                  <>
                                    {item.lastMessage.syncStatus === 'pending' ||
                                    item.lastMessage.syncStatus === 'local' ? (
                                      <span title="En attente de synchronisation" className="inline-flex shrink-0">
                                        <Clock className="h-3 w-3 text-amber-500" />
                                      </span>
                                    ) : item.type === 'prive' &&
                                      Boolean(
                                        (item.userId &&
                                          item.lastMessage.readBy?.includes(item.userId)) ||
                                          item.lastMessage.readBy?.some(
                                            (uid) => uid !== user?.uid
                                          )
                                      ) ? (
                                      <span title="Vu / Lu par le destinataire" className="inline-flex shrink-0">
                                        <CheckCheck className="h-3 w-3 text-[#53bdeb] stroke-[2.4]" />
                                      </span>
                                    ) : (
                                      <span title="Distribué" className="inline-flex shrink-0">
                                        <CheckCheck className="h-3 w-3 text-slate-400 stroke-[2]" />
                                      </span>
                                    )}
                                  </>
                                )}
                                <span className="truncate">
                                  {item.lastMessage.content}
                                </span>
                              </>
                            ) : (
                              <span className="italic text-slate-400">
                                {item.subtitle}
                              </span>
                            )}
                          </p>

                          {/* Badge de messages non-lus WhatsApp */}
                          {item.unread > 0 && (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-black text-white shadow-xs shrink-0">
                              {item.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ===================================================================== */}
          {/* PANNEAU DROIT : FENÊTRE DE DISCUSSION WHATSAPP                        */}
          {/* ===================================================================== */}
          <div
            className={`flex-1 flex flex-col bg-[#efeae2] overflow-hidden ${
              mobilePane === 'list' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* En-tête de la discussion active (WhatsApp Chat Header) */}
            <div className="bg-[#f0f2f5] border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                {/* Bouton retour sur mobile */}
                <button
                  type="button"
                  onClick={() => setMobilePane('list')}
                  className="md:hidden flex items-center justify-center rounded-full p-1.5 text-slate-600 hover:bg-slate-200 transition"
                  title="Retour à la liste des discussions"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white font-bold text-xs shadow-xs ${getAvatarBgColor(
                    currentChannelName
                  )}`}
                >
                  {getInitials(currentChannelName)}
                </div>

                <div className="min-w-0">
                  <h3 className="truncate text-xs font-black text-slate-900 leading-tight">
                    {currentChannelName}
                  </h3>
                  <p className="truncate text-[11px] text-slate-500 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">{currentChannelSubtitle}</span>
                  </p>
                </div>
              </div>

              {/* Actions d'en-tête (Recherche dans le chat, Info, Changement rapide) */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSearchInChat((v) => !v)}
                  className={`rounded-xl p-2 transition ${
                    showSearchInChat
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                  title="Rechercher dans cette discussion"
                >
                  <Search className="h-4 w-4" />
                </button>

                {/* Bouton Nouvelle Discussion / Groupe */}
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(true)}
                  className="rounded-xl p-2 text-slate-600 hover:bg-slate-200 transition"
                  title="Options de destinataires"
                >
                  <UserCheck className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Barre déroulante de recherche dans les messages */}
            {showSearchInChat && (
              <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 text-xs shrink-0 shadow-inner">
                <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  placeholder="Rechercher dans les messages..."
                  className="flex-1 bg-transparent text-xs text-slate-900 outline-none"
                  autoFocus
                />
                {chatSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setChatSearchQuery('')}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-800"
                  >
                    Effacer ({searchedChannelMessages.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowSearchInChat(false);
                    setChatSearchQuery('');
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Fil des messages avec fond WhatsApp */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {searchedChannelMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-6 text-slate-500">
                  <div className="rounded-2xl bg-white/80 p-4 shadow-sm border border-slate-200 max-w-sm">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 text-[#008069]" />
                    <p className="text-xs font-bold text-slate-800">
                      {chatSearchQuery
                        ? 'Aucun résultat trouvé dans cette discussion'
                        : `Début de la conversation dans « ${currentChannelName} »`}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {chatSearchQuery
                        ? 'Essayez avec d’autres termes.'
                        : 'Les messages sont chiffrés en local et synchronisés automatiquement avec les agents et agences autorisés.'}
                    </p>
                  </div>
                </div>
              ) : (
                searchedChannelMessages.map((msg) => {
                  const isMe = msg.senderId === user?.uid;
                  const reactionEntries = Object.entries(msg.reactions || {}).filter(
                    ([, uids]) => Array.isArray(uids) && uids.length > 0
                  );
                  const commentsList = msg.comments || [];
                  const isCommentsOpen = Boolean(openCommentsMsgIds[msg.id]);
                  // Accusé de lecture WhatsApp pour conversation individuelle (double coche bleue)
                  const directRecipientId =
                    msg.recipientId || (channelType === 'prive' ? selectedRecipientId : null);
                  const isDirectRead =
                    channelType === 'prive' &&
                    Boolean(
                      (directRecipientId && msg.readBy?.includes(directRecipientId)) ||
                        (msg.readBy && msg.readBy.some((uid) => uid !== user?.uid))
                    );

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      {/* Bulle WhatsApp */}
                      <div
                        className={`group relative max-w-[90%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-xs text-xs transition ${
                          isMe
                            ? 'bg-[#d9fdd3] text-slate-900 rounded-tr-xs border border-[#c1f5b8]/60'
                            : 'bg-white text-slate-900 rounded-tl-xs border border-slate-200/90'
                        }`}
                      >
                        {/* En-tête de message (Expéditeur et canal) */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-black text-[11px] ${
                                isMe ? 'text-emerald-900' : 'text-[#008069]'
                              }`}
                            >
                              {isMe ? 'Moi' : msg.senderName}
                            </span>
                            {!isMe && (
                              <span className="text-[9px] uppercase font-semibold text-slate-400">
                                ({msg.senderRole})
                              </span>
                            )}
                            {msg.recipientName && (
                              <span className="rounded-full bg-blue-100/70 text-blue-800 px-1.5 py-0.2 text-[9px] font-semibold">
                                → {msg.recipientName}
                              </span>
                            )}
                          </div>

                          {msg.forwardedFromSenderName && (
                            <span className="inline-flex items-center gap-1 text-[9px] italic text-slate-400">
                              <CornerUpRight className="h-2.5 w-2.5" />
                              Transféré de {msg.forwardedFromSenderName}
                            </span>
                          )}
                        </div>

                        {/* Citation du message en réponse (Bannière WhatsApp) */}
                        {msg.replyToExcerpt && (
                          <div className="mb-1.5 rounded-lg border-l-4 border-[#008069] bg-black/5 p-2 text-[10px] text-slate-700">
                            <p className="font-bold text-[#008069]">
                              {msg.replyToSenderName || 'Collaborateur'}
                            </p>
                            <p className="truncate italic">« {msg.replyToExcerpt} »</p>
                          </div>
                        )}

                        {/* Contenu textuel ou champ d'édition */}
                        {editingMessageId === msg.id ? (
                          <div className="space-y-2 mt-1">
                            <textarea
                              rows={2}
                              value={editingMessageText}
                              onChange={(e) => setEditingMessageText(e.target.value)}
                              className="w-full rounded-xl border border-[#008069] bg-white p-2 text-xs text-slate-900 outline-none"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleConfirmEdit(msg.id)}
                                className="rounded-lg bg-[#008069] px-2.5 py-1 text-[10px] font-bold text-white"
                              >
                                Enregistrer
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="whitespace-pre-line leading-relaxed text-[12px]">
                              {msg.content}
                            </p>
                            {msg.updatedAt > msg.createdAt + 2000 && (
                              <span className="inline-block text-[9px] italic text-slate-400 ml-1">
                                (modifié)
                              </span>
                            )}
                          </div>
                        )}

                        {/* Pièce jointe Image */}
                        {msg.attachmentType === 'image' && msg.attachmentDataUrl && (
                          <div className="mt-2 overflow-hidden rounded-xl border border-black/10 bg-black/5 max-w-xs">
                            <img
                              src={msg.attachmentDataUrl}
                              alt={msg.attachmentName || 'Image jointe'}
                              className="max-h-52 w-full object-cover cursor-pointer hover:opacity-95 transition"
                              onClick={() => setPreviewImageUrl(msg.attachmentDataUrl || null)}
                            />
                            {msg.attachmentName && (
                              <div className="flex items-center justify-between p-1.5 text-[10px] bg-black/10 text-slate-700">
                                <span className="truncate">{msg.attachmentName}</span>
                                <a
                                  href={msg.attachmentDataUrl}
                                  download={msg.attachmentName}
                                  className="ml-2 hover:underline inline-flex items-center gap-0.5 text-blue-600 font-bold"
                                >
                                  <Download className="h-3 w-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Pièce jointe Document */}
                        {msg.attachmentType === 'document' && (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-black/5 p-2 text-[11px] font-semibold border border-black/10">
                            <FileText className="h-4 w-4 shrink-0 text-[#008069]" />
                            <span className="truncate max-w-[190px]">
                              {msg.attachmentName || 'Document joint'}
                            </span>
                            {msg.attachmentDataUrl && (
                              <a
                                href={msg.attachmentDataUrl}
                                download={msg.attachmentName || 'document'}
                                className="ml-1 rounded p-1 hover:bg-black/10 transition text-blue-600 font-bold"
                                title="Télécharger"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Pastilles de réactions (Style WhatsApp) */}
                        {reactionEntries.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {reactionEntries.map(([emoji, uids]) => {
                              const iReacted = user ? uids.includes(user.uid) : false;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleToggleReaction(msg.id, emoji)}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-2xs transition ${
                                    iReacted
                                      ? 'bg-emerald-600 text-white ring-1 ring-emerald-300'
                                      : 'bg-white text-slate-800 hover:bg-slate-100 border border-slate-200'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span>{uids.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Pied de bulle : Heure et Accusés de distribution WhatsApp */}
                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500 select-none">
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          {isMe && (
                            <>
                              {msg.syncStatus === 'pending' || msg.syncStatus === 'local' ? (
                                <span
                                  className="inline-flex items-center text-amber-600"
                                  title="En attente de synchronisation réseau"
                                >
                                  <Clock className="h-3 w-3" />
                                </span>
                              ) : msg.syncStatus === 'error' ? (
                                <button
                                  type="button"
                                  onClick={() => void handleRetryMessage(msg.id)}
                                  className="inline-flex items-center gap-0.5 text-red-600 font-bold"
                                  title="Erreur d'envoi. Cliquer pour réessayer"
                                >
                                  <AlertCircle className="h-3 w-3" />
                                </button>
                              ) : channelType === 'prive' ? (
                                <span
                                  className={`inline-flex items-center transition-colors ${
                                    isDirectRead ? 'text-[#53bdeb]' : 'text-slate-400'
                                  }`}
                                  title={
                                    isDirectRead
                                      ? `Vu • Lu par ${currentChannelName || 'le destinataire'}`
                                      : `Distribué à ${currentChannelName || 'le destinataire'} (non lu)`
                                  }
                                >
                                  <CheckCheck
                                    className={`h-3.5 w-3.5 ${
                                      isDirectRead
                                        ? 'stroke-[2.5] text-[#53bdeb] drop-shadow-[0_0_2px_rgba(83,189,235,0.4)]'
                                        : 'stroke-[2] text-slate-400'
                                    }`}
                                  />
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center ${
                                    msg.readBy && msg.readBy.length > 1
                                      ? 'text-sky-500'
                                      : 'text-slate-400'
                                  }`}
                                  title={
                                    msg.readBy && msg.readBy.length > 1
                                      ? `Lu par ${msg.readBy.length - 1} membre(s)`
                                      : 'Distribué sur le réseau Ets AMANI'
                                  }
                                >
                                  <CheckCheck className="h-3.5 w-3.5" />
                                </span>
                              )}
                            </>
                          )}
                          {msg.readBy && msg.readBy.length > 0 && channelType !== 'prive' && (
                            <span className="text-[9px] text-slate-400">
                              ({msg.readBy.length})
                            </span>
                          )}
                        </div>

                        {/* Barre d'action rapide au survol/clic */}
                        <div className="mt-1.5 pt-1.5 border-t border-black/5 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                          <div className="flex items-center gap-1">
                            {/* Réagir */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenReactionPickerMsgId((cur) =>
                                    cur === msg.id ? null : msg.id
                                  )
                                }
                                className="rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-black/5"
                                title="Réagir"
                              >
                                <Smile className="h-3.5 w-3.5" />
                              </button>
                              {openReactionPickerMsgId === msg.id && (
                                <div className="absolute bottom-full left-0 z-20 mb-1 flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                                  {QUICK_REACTIONS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => handleToggleReaction(msg.id, emoji)}
                                      className="rounded-xl p-1 text-sm hover:bg-slate-100 transition transform hover:scale-125"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Répondre */}
                            <button
                              type="button"
                              onClick={() => handleReplyToMessage(msg)}
                              className="rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-black/5"
                              title="Répondre"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>

                            {/* Transférer */}
                            <button
                              type="button"
                              onClick={() => {
                                setSharingMessage(msg);
                                setShareNote('');
                              }}
                              className="rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-black/5"
                              title="Transférer"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </button>

                            {/* Commentaires */}
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCommentsMsgIds((prev) => ({
                                  ...prev,
                                  [msg.id]: !prev[msg.id],
                                }))
                              }
                              className="rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-black/5"
                              title="Commenter"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              {commentsList.length > 0 && (
                                <span className="ml-0.5 font-bold">
                                  {commentsList.length}
                                </span>
                              )}
                            </button>

                            {/* Copier */}
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg)}
                              className="rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-black/5"
                              title="Copier"
                            >
                              <Copy className="h-3 w-3" />
                            </button>

                            {/* Modifier */}
                            {isMe && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(msg)}
                                className="rounded p-1 text-slate-500 hover:text-slate-800 hover:bg-black/5"
                                title="Modifier mon message"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                            )}

                            {/* Supprimer */}
                            {(isMe || isGlobalRole) && (
                              <>
                                {deletingMessageId === msg.id ? (
                                  <div className="flex items-center gap-1 bg-red-600 text-white rounded px-1.5 py-0.5">
                                    <span className="text-[9px]">Supprimer ?</span>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteMessage(msg.id)}
                                      className="font-bold underline text-[9px]"
                                    >
                                      Oui
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingMessageId(null)}
                                      className="text-[9px]"
                                    >
                                      Non
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingMessageId(msg.id)}
                                    className="rounded p-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Thread des commentaires sous la bulle */}
                        {(isCommentsOpen || commentsList.length > 0) && (
                          <div className="mt-2 rounded-xl bg-black/5 p-2 space-y-1.5">
                            {commentsList.map((cmt) => (
                              <div
                                key={cmt.id}
                                className="rounded-lg bg-white p-2 text-[10px] border border-slate-200/80 shadow-2xs"
                              >
                                <div className="flex justify-between font-bold text-slate-800">
                                  <span>{cmt.authorName}</span>
                                  <span className="text-[9px] font-normal text-slate-400">
                                    {new Date(cmt.createdAt).toLocaleTimeString('fr-FR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <p className="text-slate-600 mt-0.5">{cmt.content}</p>
                              </div>
                            ))}

                            {isCommentsOpen && (
                              <div className="flex items-center gap-1 pt-1">
                                <input
                                  type="text"
                                  value={commentInputs[msg.id] || ''}
                                  onChange={(e) =>
                                    setCommentInputs((prev) => ({
                                      ...prev,
                                      [msg.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void handleAddComment(msg.id);
                                    }
                                  }}
                                  placeholder="Écrire un commentaire..."
                                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleAddComment(msg.id)}
                                  className="rounded-lg bg-[#008069] px-2 py-1 text-[10px] font-bold text-white"
                                >
                                  OK
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* ===================================================================== */}
            {/* ZONE DE SAISIE FIXE EN BAS (STYLE WHATSAPP ANDROID)                    */}
            {/* ===================================================================== */}
            <form
              onSubmit={handleSendMessage}
              className="bg-[#f0f2f5] p-3 border-t border-slate-200 shrink-0 space-y-2"
            >
              {/* Bannière de citation d'une réponse active */}
              {replyingTo && (
                <div className="flex items-center justify-between rounded-xl border-l-4 border-[#008069] bg-white p-2.5 shadow-xs">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-[#008069] flex items-center gap-1">
                      <Reply className="h-3 w-3" />
                      Réponse à {replyingTo.senderName}
                    </p>
                    <p className="truncate text-[11px] text-slate-600 italic">
                      « {replyingTo.content} »
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Prévisualisation de pièce jointe avant expédition */}
              {attachmentName && (
                <div className="flex items-center justify-between rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {attachmentType === 'image' ? (
                      <ImageIcon className="h-4 w-4 text-[#008069] shrink-0" />
                    ) : (
                      <FileText className="h-4 w-4 text-[#008069] shrink-0" />
                    )}
                    <span className="font-semibold truncate">{attachmentName}</span>
                    {attachmentType === 'image' && attachmentDataUrl && (
                      <img
                        src={attachmentDataUrl}
                        alt="miniature"
                        className="h-6 w-6 rounded object-cover"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentName(null);
                      setAttachmentType('none');
                      setAttachmentDataUrl(null);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Capsule de saisie WhatsApp Android */}
              <div className="relative flex items-center gap-2">
                {/* Sélecteur d'émojis complet avec recherche et catégories */}
                <ChatEmojiPicker
                  isOpen={showEmojiPicker}
                  onClose={() => setShowEmojiPicker(false)}
                  onSelectEmoji={handleInsertEmoji}
                />

                <div className="flex flex-1 items-center gap-1.5 rounded-2xl bg-white px-2.5 py-1.5 shadow-xs border border-slate-200">
                  {/* Bouton sélecteur d'émojis WhatsApp */}
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    className={`p-1 rounded-full transition ${
                      showEmojiPicker
                        ? 'text-[#008069] bg-emerald-50'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                    }`}
                    title="Insérer un émoji"
                  >
                    <Smile className="h-5 w-5" />
                  </button>

                  <input
                    ref={messageInputRef}
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder={`Message pour ${currentChannelName}...`}
                    className="flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 outline-none py-1"
                  />

                  {/* Trombone de pièce jointe */}
                  <label
                    className="cursor-pointer text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition p-1 rounded-full"
                    title="Joindre une photo ou un document"
                  >
                    <Paperclip className="h-4 w-4" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={handleFileSelected}
                    />
                  </label>
                </div>

                {/* Bouton d'envoi circulaire WhatsApp */}
                <button
                  type="submit"
                  disabled={sending || (!messageText.trim() && !attachmentDataUrl)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white shadow-md hover:bg-[#006a57] disabled:opacity-40 transition"
                  title="Envoyer le message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL NOUVELLE DISCUSSION / RECHERCHE CONTACTS & GROUPES                */}
      {/* ========================================================================= */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Nouvelle discussion Ets AMANI
                </h3>
                <p className="text-[11px] text-slate-500">
                  Choisissez un collaborateur, un service ou créez un groupe
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateGroupModal(true);
                  setShowNewChatModal(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 text-[#008069] border border-emerald-200 py-2.5 text-xs font-bold hover:bg-emerald-100 transition"
              >
                <Users className="h-4 w-4" />
                + Créer un nouveau groupe
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {/* Liste des utilisateurs */}
              <p className="text-xs font-bold uppercase text-slate-400">
                Collaborateurs ({usersList.length})
              </p>
              <div className="space-y-1">
                {usersList.map((u) => (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => {
                      setChannelType('prive');
                      setSelectedRecipientId(u.uid);
                      setShowNewChatModal(false);
                      setMobilePane('conversation');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl p-2.5 hover:bg-slate-50 text-left transition"
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white font-bold text-xs ${getAvatarBgColor(
                        u.displayName || 'U'
                      )}`}
                    >
                      {getInitials(u.displayName || 'U')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {u.displayName}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {u.function || u.role} • {u.agencyId || 'Centrale'}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL CRÉATION DE GROUPE                                               */}
      {/* ========================================================================= */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleCreateCustomGroup}
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">
                Nouveau groupe de discussion
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateGroupModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Nom du groupe :
              </label>
              <input
                type="text"
                required
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Ex: Commission Change & Audit"
                className="w-full rounded-xl border border-slate-300 p-2 text-xs outline-none focus:border-[#008069]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Sélectionner les participants ({newGroupMemberIds.length}) :
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2">
                {usersList.map((u) => {
                  const checked = newGroupMemberIds.includes(u.uid);
                  return (
                    <label
                      key={u.uid}
                      className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewGroupMemberIds((prev) => [...prev, u.uid]);
                          } else {
                            setNewGroupMemberIds((prev) =>
                              prev.filter((id) => id !== u.uid)
                            );
                          }
                        }}
                      />
                      <span className="font-semibold text-slate-800 truncate">
                        {u.displayName} ({u.function || u.role})
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateGroupModal(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#008069] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#006a57]"
              >
                Créer le groupe
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL TRANSFERT DE MESSAGE                                             */}
      {/* ========================================================================= */}
      {sharingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleConfirmForwardMessage}
            className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Share2 className="h-4 w-4 text-[#008069]" />
                Transférer ce message
              </h3>
              <button
                type="button"
                onClick={() => setSharingMessage(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-xs border border-slate-200">
              <p className="font-bold text-slate-700 mb-0.5">
                De {sharingMessage.senderName} :
              </p>
              <p className="text-slate-600 line-clamp-3 italic">
                « {sharingMessage.content} »
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Destinataire du transfert :
                </label>
                <select
                  value={shareTargetType}
                  onChange={(e) =>
                    setShareTargetType(
                      e.target.value as LocalChatMessage['channelType']
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white p-2 font-semibold"
                >
                  <option value="prive">Collaborateur (Message Privé)</option>
                  <option value="groupe">Groupe de travail</option>
                  <option value="service">Service spécifique</option>
                  <option value="agence">Canal Agence locale</option>
                  <option value="global">Réseau Général Ets AMANI</option>
                </select>
              </div>

              {shareTargetType === 'prive' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Choisir le collaborateur :
                  </label>
                  <select
                    required
                    value={shareRecipientId}
                    onChange={(e) => setShareRecipientId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 font-semibold"
                  >
                    <option value="">-- Sélectionner un collègue --</option>
                    {usersList.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName} ({u.function || u.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shareTargetType === 'groupe' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Choisir le groupe :
                  </label>
                  <select
                    value={shareGroupId}
                    onChange={(e) => setShareGroupId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 font-semibold"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shareTargetType === 'service' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Choisir le service :
                  </label>
                  <select
                    value={shareServiceTag}
                    onChange={(e) => setShareServiceTag(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 font-semibold"
                  >
                    {ETS_SERVICES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Note d'accompagnement :
                </label>
                <input
                  type="text"
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  placeholder="Ex: Pour suivi..."
                  className="w-full rounded-xl border border-slate-300 p-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSharingMessage(null)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-600 font-semibold"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#008069] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#006a57]"
              >
                Transférer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. ONGLET 2 : DIFFUSIONS ET ANNONCES OFFICIELLES                          */}
      {/* ========================================================================= */}
      {activeTab === 'broadcasts' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Notes de Service & Annonces Officielles
              </h3>
              <p className="text-xs text-slate-500">
                Communications officielles de la Direction Générale et des Administrateurs
              </p>
            </div>

            {canBroadcast && (
              <button
                type="button"
                onClick={() => setShowBroadcastForm((v) => !v)}
                className="rounded-xl bg-[#008069] px-4 py-2 text-xs font-bold text-white hover:bg-[#006a57] transition shadow-xs"
              >
                {showBroadcastForm ? 'Fermer le formulaire' : '+ Nouvelle Diffusion Officielle'}
              </button>
            )}
          </div>

          {showBroadcastForm && canBroadcast && (
            <form
              onSubmit={handleCreateBroadcast}
              className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm space-y-3"
            >
              <h4 className="text-xs font-bold text-slate-900">
                Publier une annonce officielle
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  required
                  value={bcTitle}
                  onChange={(e) => setBcTitle(e.target.value)}
                  placeholder="Titre de la note de service"
                  className="rounded-xl border border-slate-300 p-2 text-xs"
                />
                <select
                  value={bcSeverity}
                  onChange={(e) => setBcSeverity(e.target.value as LocalBroadcast['severity'])}
                  className="rounded-xl border border-slate-300 p-2 text-xs font-semibold"
                >
                  <option value="info">Information Standard</option>
                  <option value="important">Important</option>
                  <option value="critique">Critique (Accusé obligatoire)</option>
                </select>
                {isGlobalRole ? (
                  <select
                    value={bcScope}
                    onChange={(e) => setBcScope(e.target.value as LocalBroadcast['scope'])}
                    className="rounded-xl border border-slate-300 p-2 text-xs font-semibold"
                  >
                    <option value="global">Tout le Réseau Ets AMANI</option>
                    <option value="agence">Agence Spécifique</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={`Agence : ${user?.agencyId || 'Locale'}`}
                    className="rounded-xl border border-slate-200 bg-slate-100 p-2 text-xs"
                  />
                )}
              </div>

              {isGlobalRole && bcScope === 'agence' && (
                <select
                  value={bcAgencyId}
                  onChange={(e) => setBcAgencyId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 p-2 text-xs"
                >
                  <option value="">Sélectionner l'agence concernée</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              )}

              <textarea
                rows={2}
                required
                value={bcMessage}
                onChange={(e) => setBcMessage(e.target.value)}
                placeholder="Texte détaillé de l'instruction ou annonce..."
                className="w-full rounded-xl border border-slate-300 p-2 text-xs"
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={bcRequiresAck}
                    onChange={(e) => setBcRequiresAck(e.target.checked)}
                  />
                  Exiger un accusé de réception nominatif
                </label>
                <button
                  type="submit"
                  className="rounded-xl bg-[#008069] px-4 py-2 text-xs font-bold text-white hover:bg-[#006a57]"
                >
                  Diffuser
                </button>
              </div>
            </form>
          )}

          {/* Liste des annonces officielles */}
          <div className="space-y-3">
            {broadcasts.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-600">Aucune annonce officielle</p>
              </div>
            ) : (
              broadcasts.map((bc) => {
                const acked = user ? bc.acknowledgedBy?.includes(user.uid) : false;
                return (
                  <div
                    key={bc.id}
                    className={`rounded-2xl border p-4 text-xs shadow-xs ${
                      bc.severity === 'critique'
                        ? 'border-red-300 bg-red-50/70'
                        : bc.severity === 'important'
                          ? 'border-amber-300 bg-amber-50/60'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span className="font-black text-sm text-slate-900">
                            {bc.title}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                            {bc.severity} • {bc.agencyName || 'Global'}
                          </span>
                        </div>
                        <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                          {bc.message}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Par {bc.authorName} • {new Date(bc.createdAt).toLocaleString('fr-FR')} •{' '}
                          {bc.acknowledgedBy?.length || 0} confirmation(s) de lecture
                        </p>
                      </div>

                      {bc.requiresAck && (
                        <div className="shrink-0">
                          {acked ? (
                            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 px-3 py-1.5 font-bold text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Lecture confirmée
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAckBroadcast(bc.id)}
                              className="rounded-xl bg-[#008069] px-3.5 py-2 font-bold text-white hover:bg-[#006a57] transition shadow-xs"
                            >
                              Accuser réception
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL PLEIN ÉCRAN APERÇU D'IMAGE                                       */}
      {/* ========================================================================= */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-3xl p-4 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800">
                Aperçu de la pièce jointe
              </span>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-2 flex justify-center overflow-auto max-h-[70vh]">
              <img
                src={previewImageUrl}
                alt="Aperçu agrandi"
                className="max-h-[65vh] w-auto rounded-2xl object-contain"
              />
            </div>
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <a
                href={previewImageUrl}
                download="piece_jointe_ets_amani.png"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#008069] px-4 py-2 text-xs font-bold text-white hover:bg-[#006a57]"
              >
                <Download className="h-3.5 w-3.5" />
                Télécharger
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
