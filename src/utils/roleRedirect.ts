import type { AppUser } from '../types/auth';

/**
 * Redirige l'utilisateur vers son tableau de bord selon son rôle et son état d'approbation.
 */
export function getDashboardRoute(userOrRole: AppUser | string | null | undefined): string {
  if (!userOrRole) {
    return '/login';
  }

  // Extraction du rôle et de l'état selon qu'on passe un objet AppUser ou une chaîne
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  const normalizedRole = role?.trim().toLowerCase();

  const isPrivileged =
    normalizedRole === 'administrateur_systeme' || normalizedRole === 'directeur_general';

  // Si c'est un AppUser et qu'il n'est PAS privilégié, on vérifie l'approbation
  if (typeof userOrRole === 'object') {
    const isApproved =
      userOrRole.isApproved &&
      userOrRole.status !== 'pending' &&
      userOrRole.registrationStatus !== 'pending';

    if (!isApproved && !isPrivileged) {
      return '/validation-en-attente';
    }
  }

  // Redirection selon le rôle
  switch (normalizedRole) {
    case 'administrateur_systeme':
      return '/dashboard/administrateur-systeme';
    case 'directeur_general':
      return '/dashboard/directeur-general';
    case 'administrateur_agence':
      return '/dashboard/administrateur-agence';
    case 'agent':
      return '/dashboard/agent';
    case 'client':
      return '/dashboard/client';
    case 'abonne':
      return '/dashboard/abonne';
    default:
      return '/login';
  }
}
