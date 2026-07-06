// Mirrors the columns the mobile app reads from the shared Supabase project.
// Kept in sync with the web app's src/lib/supabase/types.ts (subset).

export type Framework = 'react-vite' | 'vue' | 'vanilla' | 'next';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  framework: Framework;
  project_type: string | null;
  subdomain: string | null;
  published_url: string | null;
  deployed_url: string | null;
  custom_domain: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

// Mobile (React Native) projects aren't published to the web — per the App
// Store 2.5.2 strategy they're exported to Expo/EAS. Web projects publish live.
export function isMobileProject(p: Pick<Project, 'project_type'>): boolean {
  return p.project_type === 'mobile';
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  plan: 'free' | 'pro' | 'teams';
  credits: number;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

// The best public URL for a project, or null if it isn't live yet.
export function projectUrl(p: Project): string | null {
  if (p.custom_domain) return `https://${p.custom_domain}`;
  return p.published_url || p.deployed_url || (p.subdomain ? `https://${p.subdomain}.wyberai.app` : null);
}
