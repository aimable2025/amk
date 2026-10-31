import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  MessageSquare,
  Users,
  Building2,
  Globe,
  Briefcase,
  X,
  Clock,
  ArrowRight,
  CornerDownRight,
  Radio,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAuthorizedChatMessages,
  getAuthorizedBroadcasts,
} from '../../services/EnterpriseOperationsService';
import { getAllSystemUsers, type ManagedUser } from '../../services/SystemUserService';
import type { LocalChatMessage, LocalBroadcast } from '../../lib/db';

export interface ChatNavigationTarget {
  channelType: LocalChatMessage['channelType'];
  groupId?: string;
  serviceId?: string;
  userId?: string;
  messageId?: string;
}

interface HeaderChatSearchProps {
  onNavigateToChat?: (target?: ChatNavigationTarget) => void;
  className?: string;
}

const ETS_SERVICES: Record<string, string> = {
  guichetier: 'Guichet & Caisse',
  comptable: 'Comptabilité & Audit',
  agent_operateur_mobile: 'Flotte & Mobile Money',
  agent_change: 'Change USD / CDF',
  agent_terrain: 'Opérations Terrain',
  service_paie: 'Service Paie & Salaires',
  administration_agence: 'Administration Agence',
  direction_generale: 'Direction Générale',
};

const DEFAULT_GROUPS: Record<string, string> = {
  'grp-coordination': 'Coordination Réseau & Agences',
  'grp-tresorerie': 'Trésorerie & Billetage Rapide',
  'grp-flotte': 'Flotte & Opérations Mobiles',
};

export default function HeaderChatSearch({
  onNavigateToChat,
  className = '',
}: HeaderChatSearchProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'conversations' | 'messages' | 'broadcasts'>('all');

  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [broadcasts, setBroadcasts] = useState<LocalBroadcast[]>([]);
  const [usersList, setUsersList] = useState<ManagedUser[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Charger les données de messagerie lorsque l'utilisateur s'apprête à chercher
  const loadChatData = async () => {
    if (!user) return;
    setIsLoadingData(true);
    try {
      const [msgs, bcs, usrs] = await Promise.all([
        getAuthorizedChatMessages(user),
        getAuthorizedBroadcasts(user),
        getAllSystemUsers(),
      ]);
      setMessages(msgs);
      setBroadcasts(bcs);
      setUsersList(usrs.filter((u) => u.uid !== user.uid));
    } catch {
      // mode hors-ligne
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      void loadChatData();
    }
  }, [isOpen]);

  // Fermeture lors d'un clic en dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Détection des conversations possibles
  const matchedConversations = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    const list: Array<{
      id: string;
      name: string;
      subtitle: string;
      type: LocalChatMessage['channelType'];
      icon: typeof Globe;
      groupId?: string;
      serviceId?: string;
      userId?: string;
      lastMessageText?: string;
    }> = [];

    // 1. Canal Global
    if ('réseau général ets amani global entreprise'.includes(q)) {
      list.push({
        id: 'global',
        name: 'Réseau Général Ets AMANI',
        subtitle: 'Canal entreprise tous services',
        type: 'global',
        icon: Globe,
      });
    }

    // 2. Canal Agence
    if ('agence locale equipe agences'.includes(q) || (user?.agencyId && user.agencyId.toLowerCase().includes(q))) {
      list.push({
        id: 'agence',
        name: user?.agencyId ? `Équipe Agence ${user.agencyId}` : 'Mon Agence Locale',
        subtitle: 'Discussions internes à votre agence',
        type: 'agence',
        icon: Building2,
      });
    }

    // 3. Groupes par défaut & enregistrés
    for (const [gid, gname] of Object.entries(DEFAULT_GROUPS)) {
      if (gname.toLowerCase().includes(q) || gid.toLowerCase().includes(q)) {
        list.push({
          id: gid,
          name: gname,
          subtitle: 'Groupe institutionnel',
          type: 'groupe',
          icon: Users,
          groupId: gid,
        });
      }
    }

    // Groupes personnalisés sauvés
    try {
      const saved = window.localStorage.getItem('ets_amani_chat_groups_v1');
      if (saved) {
        const customGroups = JSON.parse(saved);
        if (Array.isArray(customGroups)) {
          for (const cg of customGroups) {
            if (cg.name?.toLowerCase().includes(q)) {
              list.push({
                id: cg.id,
                name: cg.name,
                subtitle: `Groupe créé (${cg.participantNames?.join(', ') || ''})`,
                type: 'groupe',
                icon: Users,
                groupId: cg.id,
              });
            }
          }
        }
      }
    } catch {
      // ignore
    }

    // 4. Services métiers
    for (const [sid, sname] of Object.entries(ETS_SERVICES)) {
      if (sname.toLowerCase().includes(q) || sid.toLowerCase().includes(q)) {
        list.push({
          id: sid,
          name: sname,
          subtitle: 'Pôle métier & services spécialisés',
          type: 'service',
          icon: Briefcase,
          serviceId: sid,
        });
      }
    }

    // 5. Utilisateurs (Chat Privé)
    for (const u of usersList) {
      const matchName = u.displayName?.toLowerCase().includes(q);
      const matchEmail = u.email?.toLowerCase().includes(q);
      const matchRole = u.role?.toLowerCase().includes(q);
      if (matchName || matchEmail || matchRole) {
        list.push({
          id: u.uid,
          name: u.displayName || u.email || 'Utilisateur',
          subtitle: `Message privé • ${u.role?.replace(/_/g, ' ')}`,
          type: 'prive',
          icon: MessageSquare,
          userId: u.uid,
        });
      }
    }

    return list.slice(0, 8);
  }, [query, user, usersList]);

  // Messages filtrés
  const matchedMessages = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    return messages
      .filter((m) => {
        const matchContent = m.content.toLowerCase().includes(q);
        const matchSender = m.senderName.toLowerCase().includes(q);
        const matchFile = m.attachmentName && m.attachmentName.toLowerCase().includes(q);
        return matchContent || matchSender || matchFile;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
  }, [messages, query]);

  // Diffusions filtrées
  const matchedBroadcasts = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    return broadcasts
      .filter((b) => {
        return (
          b.title.toLowerCase().includes(q) ||
          b.message.toLowerCase().includes(q) ||
          b.agencyName?.toLowerCase().includes(q)
        );
      })
      .slice(0, 5);
  }, [broadcasts, query]);

  const totalResults =
    matchedConversations.length + matchedMessages.length + matchedBroadcasts.length;

  const handleSelectConversation = (item: (typeof matchedConversations)[0]) => {
    setIsOpen(false);
    const target: ChatNavigationTarget = {
      channelType: item.type,
      groupId: item.groupId,
      serviceId: item.serviceId,
      userId: item.userId,
    };
    try {
      window.sessionStorage.setItem('ets_amani_chat_active_target', JSON.stringify(target));
      window.dispatchEvent(new CustomEvent('ets-amani-navigate-chat', { detail: target }));
    } catch {
      // ignore
    }
    onNavigateToChat?.(target);
  };

  const handleSelectMessage = (m: LocalChatMessage) => {
    setIsOpen(false);
    const target: ChatNavigationTarget = {
      channelType: m.channelType,
      groupId:
        m.channelType === 'groupe'
          ? m.channelId.replace('channel-group-', '')
          : undefined,
      serviceId: m.serviceTag || undefined,
      userId:
        m.channelType === 'prive'
          ? m.senderId === user?.uid
            ? m.recipientId || undefined
            : m.senderId
          : undefined,
      messageId: m.id,
    };
    try {
      window.sessionStorage.setItem('ets_amani_chat_active_target', JSON.stringify(target));
      window.dispatchEvent(new CustomEvent('ets-amani-navigate-chat', { detail: target }));
    } catch {
      // ignore
    }
    onNavigateToChat?.(target);
  };

  const handleSelectBroadcast = () => {
    setIsOpen(false);
    try {
      window.sessionStorage.setItem('ets_amani_chat_open_tab', 'broadcasts');
      window.dispatchEvent(new CustomEvent('ets-amani-chat-tab', { detail: 'broadcasts' }));
    } catch {
      // ignore
    }
    onNavigateToChat?.();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Barre de recherche intégrée */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          placeholder="Rechercher dans le Chat (contacts, groupes, messages)..."
          className="h-9 w-full min-w-[210px] sm:min-w-[300px] lg:min-w-[360px] rounded-xl border border-slate-200 bg-slate-50/90 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#008069] focus:bg-white focus:ring-2 focus:ring-[#008069]/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 text-slate-400 hover:text-slate-600 transition"
            aria-label="Effacer la recherche"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="pointer-events-none absolute right-2.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hidden sm:inline">
            Chat
          </span>
        )}
      </div>

      {/* Menu déroulant des résultats de recherche instantanée */}
      {isOpen && (
        <div className="absolute right-0 left-0 sm:left-auto sm:right-0 sm:w-[480px] top-11 z-50 max-h-[80vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-100 flex flex-col font-sans">
          {/* Header du popup avec onglets de filtrage */}
          <div className="bg-[#008069] text-white p-3 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-200" />
              <span className="text-xs font-bold tracking-tight">Recherche Chat Ets AMANI</span>
              {query && (
                <span className="rounded-full bg-white/20 px-2 py-0.2 text-[10px] font-bold">
                  {totalResults} résultat(s)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white rounded-lg p-0.5 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Onglets de filtrage si une recherche est en cours */}
          {query.trim() && (
            <div className="flex border-b border-slate-100 bg-slate-50 px-3 py-1.5 gap-1 overflow-x-auto scrollbar-none text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  activeTab === 'all'
                    ? 'bg-[#008069] text-white'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                Tous ({totalResults})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('conversations')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  activeTab === 'conversations'
                    ? 'bg-[#008069] text-white'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                Discussions ({matchedConversations.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('messages')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  activeTab === 'messages'
                    ? 'bg-[#008069] text-white'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                Messages ({matchedMessages.length})
              </button>
              {matchedBroadcasts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('broadcasts')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    activeTab === 'broadcasts'
                      ? 'bg-[#008069] text-white'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  Annonces ({matchedBroadcasts.length})
                </button>
              )}
            </div>
          )}

          {/* Corps des résultats scrollable */}
          <div className="overflow-y-auto max-h-[60vh] divide-y divide-slate-100 p-1">
            {!query.trim() ? (
              <div className="p-6 text-center text-slate-500">
                <Search className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold text-slate-700">
                  Recherchez rapidement dans l'ensemble du module Chat
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                  Tapez un mot-clé, le nom d'un collègue, un pôle métier (ex: Guichet, Caisse, Trésorerie) ou le texte d'un message.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[10px]">
                  {['Réseau', 'Trésorerie', 'Guichet', 'Agence', 'Flotte'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setQuery(tag);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600 hover:border-[#008069] hover:text-[#008069] transition"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            ) : totalResults === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-700">Aucun résultat trouvé pour « {query} »</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Vérifiez l'orthographe ou essayez un mot-clé plus court.
                </p>
              </div>
            ) : (
              <>
                {/* 1. DISCUSSIONS / CANAUX CORRESPONDANTS */}
                {(activeTab === 'all' || activeTab === 'conversations') &&
                  matchedConversations.length > 0 && (
                    <div className="p-2">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                        <span>Discussions & Canaux ({matchedConversations.length})</span>
                      </div>
                      <div className="space-y-1 mt-1">
                        {matchedConversations.map((item) => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectConversation(item)}
                              className="w-full flex items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-emerald-50/70 group"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-[#008069] group-hover:bg-[#008069] group-hover:text-white transition">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800 truncate group-hover:text-[#008069]">
                                    {item.name}
                                  </span>
                                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-[#008069] transition opacity-0 group-hover:opacity-100" />
                                </div>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {item.subtitle}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* 2. MESSAGES TROUVÉS */}
                {(activeTab === 'all' || activeTab === 'messages') &&
                  matchedMessages.length > 0 && (
                    <div className="p-2">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                        <span>Messages correspondants ({matchedMessages.length})</span>
                      </div>
                      <div className="space-y-1 mt-1">
                        {matchedMessages.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleSelectMessage(m)}
                            className="w-full flex items-start gap-2.5 rounded-xl p-2.5 text-left transition hover:bg-emerald-50/70 group"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 mt-0.5 group-hover:bg-[#008069] group-hover:text-white transition">
                              <CornerDownRight className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-800 truncate">
                                  {m.senderName}
                                  <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                                    • {m.channelName || m.channelType}
                                  </span>
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {m.senderId === user?.uid && (
                                    <>
                                      {m.channelType === 'prive' &&
                                      Boolean(m.readBy && m.readBy.some((id) => id !== user?.uid)) ? (
                                        <span title="Lu par le destinataire" className="inline-flex">
                                          <CheckCheck className="h-3 w-3 text-[#53bdeb] stroke-[2.4]" />
                                        </span>
                                      ) : (
                                        <span title="Distribué" className="inline-flex">
                                          <CheckCheck className="h-3 w-3 text-slate-400 stroke-[2]" />
                                        </span>
                                      )}
                                    </>
                                  )}
                                  <span className="text-[10px] text-slate-400 tabular-nums">
                                    {formatTime(m.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-slate-600 line-clamp-2 mt-0.5 bg-slate-50 group-hover:bg-emerald-100/40 p-1.5 rounded-lg border border-slate-100">
                                {m.content}
                              </p>
                              {m.attachmentName && (
                                <span className="text-[10px] font-semibold text-emerald-700 mt-1 inline-block">
                                  📎 {m.attachmentName}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                {/* 3. DIFFUSIONS OFFICIELLES */}
                {(activeTab === 'all' || activeTab === 'broadcasts') &&
                  matchedBroadcasts.length > 0 && (
                    <div className="p-2">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                        <span>Annonces Officielles ({matchedBroadcasts.length})</span>
                      </div>
                      <div className="space-y-1 mt-1">
                        {matchedBroadcasts.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={handleSelectBroadcast}
                            className="w-full flex items-start gap-2.5 rounded-xl p-2.5 text-left transition hover:bg-amber-50 group border border-amber-100/60 bg-amber-50/30"
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white mt-0.5">
                              <Radio className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-950 truncate">
                                  {b.title}
                                </span>
                                <span className="text-[10px] font-bold text-amber-700 uppercase">
                                  {b.severity}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 line-clamp-2 mt-0.5">
                                {b.message}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>

          {/* Pied du popup */}
          <div className="border-t border-slate-100 bg-slate-50/90 p-2 text-center shrink-0 flex items-center justify-between px-3">
            <span className="text-[10px] text-slate-400">
              Tapez <kbd className="rounded border bg-white px-1 py-0.5 font-mono text-[9px]">Échap</kbd> pour fermer
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigateToChat?.();
              }}
              className="text-[11px] font-bold text-[#008069] hover:underline flex items-center gap-1"
            >
              <span>Ouvrir le module Chat</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
