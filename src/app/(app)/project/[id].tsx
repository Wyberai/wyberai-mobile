import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { projectUrl, isMobileProject, type Project } from '@/lib/types';
import { API_BASE, deleteProject, fetchIsIndia, duplicateProject, publishProject, renameProject, unpublishProject } from '@/lib/api';
import type { FileMap } from '@/lib/api';
import { tap, warn } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Spinner';
import { WebsiteLaunchChecklist } from '@/components/WebsiteLaunchChecklist';
import { PreviewActivityCard } from '@/components/PreviewActivityCard';
import { BottomSheet } from '@/components/BottomSheet';
import { DomainSheet } from '@/components/DomainSheet';
import { useT } from '@/lib/i18n/useT';
import { PROJECT_DETAIL_STRINGS } from '@/lib/i18n/dict/project-detail';
import { PROJECTS_STRINGS } from '@/lib/i18n/dict/projects';
import { brand, font, radius, space } from '@/lib/theme';

const SELECT =
  'id,user_id,name,description,framework,project_type,subdomain,published_url,deployed_url,custom_domain,custom_domain_verified,is_public,thumbnail_url,created_at,updated_at';

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT(PROJECT_DETAIL_STRINGS);
  const tp = useT(PROJECTS_STRINGS);
  const showToast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);
  const [india, setIndia] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastNavRef = useRef(0);

  // Debounce the tool-row pushes below — a double-tap (fat-finger, or the tap
  // landing right as the screen transition starts) would otherwise stack the
  // same screen twice on the nav stack.
  function navigateOnce(href: Href) {
    const now = Date.now();
    if (now - lastNavRef.current < 700) return;
    lastNavRef.current = now;
    router.push(href);
  }

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('projects').select(SELECT).eq('id', id).maybeSingle();
    if (error) {
      // Distinguish a real fetch failure (RLS/grant gap, network error, a
      // selected column not actually present) from a genuinely-missing
      // project — treating them the same silently 404s every project screen
      // for every user the moment a query error occurs, with no signal of
      // why.
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setProject((data as Project) ?? null);
    setLoading(false);
  }, [id]);

  // Refetch on focus, not just on mount — this is what actually closes the
  // domain/marketplace-purchase gap: DomainSheet's buy flow (and the Dodo
  // checkout browser in general) has no push/webhook signal back into this
  // screen, so returning to it (backgrounding/foregrounding the checkout
  // browser, or navigating back) is the only reliable moment left to pick up
  // a server-side change that happened while the screen was away.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const live = project ? projectUrl(project) : null;

  // Grow is India-only; asked of the server (same rule as web), fails closed.
  useEffect(() => { fetchIsIndia().then(setIndia); }, []);
  const isMobile = project ? isMobileProject(project) : false;

  async function doPublish(override = false) {
    if (!project || publishing) return;
    setPublishing(true);
    try {
      const result = await publishProject(project.id, override);
      if (result.ok) {
        await load();
        Alert.alert(t('published'), t('publishedBody'), [
          { text: t('open'), onPress: () => WebBrowser.openBrowserAsync(result.publishedUrl).catch(() => {}) },
          { text: t('share'), onPress: () => Share.share({ message: result.publishedUrl, url: result.publishedUrl }).catch(() => {}) },
          { text: t('done'), style: 'cancel' },
        ]);
      } else if (result.blocked) {
        // Critical RLS leak — same "publish anyway" escape hatch as the web editor.
        Alert.alert(t('securityCheck'), result.message, [
          { text: t('cancel'), style: 'cancel' },
          { text: t('publishAnyway'), style: 'destructive', onPress: () => doPublish(true) },
        ]);
      } else {
        Alert.alert(t('publishFailed'), result.error);
      }
    } catch (e) {
      // A thrown network error / timeout must never strand the button as a
      // spinner (the "had to try twice" symptom).
      Alert.alert(t('publishFailed'), (e as Error).message || t('somethingWentWrong'));
    } finally {
      setPublishing(false);
    }
  }

  function doOpenOnDevice() {
    if (!project) return;
    const deepLink = `wyberai://project/${project.id}`;
    Alert.alert(
      t('openInWyberai'),
      t('openInWyberaiBody'),
      [
        { text: t('open'), onPress: () => WebBrowser.openBrowserAsync(deepLink).catch(() => {}) },
        { text: t('share'), onPress: () => Share.share({ message: deepLink, url: deepLink }).catch(() => {}) },
        { text: t('done'), style: 'cancel' },
      ],
    );
  }

  async function saveName() {
    if (!project || savingName) return;
    const next = draftName.trim();
    if (!next || next === project.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await renameProject(project.id, next);
      setProject({ ...project, name: next });
      showToast(t('renamed'));
    } catch (e) {
      Alert.alert(t('renameFailed'), (e as Error).message);
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  }

  function doDelete() {
    if (!project) return;
    warn();
    Alert.alert(
      t('deleteThisApp'),
      t('deleteAppBody').replace('{name}', project.name || t('untitled')),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProject(project.id);
              router.back();
            } catch (e) {
              Alert.alert(t('deleteFailed'), (e as Error).message);
            }
          },
        },
      ],
    );
  }

  async function doDuplicate() {
    if (!project || duplicating) return;
    setDuplicating(true);
    try {
      const fork = await duplicateProject(project.id);
      showToast('Duplicated', 'success');
      router.push(`/build/${fork.id}`);
    } catch (e) {
      Alert.alert(t('failed'), (e as Error).message);
    } finally {
      setDuplicating(false);
    }
  }

  function wirePayments(provider: string, secretNames: string[], wiringPrompt: string) {
    if (!project) return;
    const names = secretNames.map((n) => `"${n}"`).join(' and ');
    Alert.alert(
      `Add your ${provider} keys`,
      `Add ${secretNames.length > 1 ? 'secrets' : 'a secret'} named ${names} in Secrets first, then come back and send the wiring prompt to the builder.`,
      [
        { text: 'Open Secrets', onPress: () => router.push('/secrets' as Href) },
        {
          text: 'Send wiring prompt',
          onPress: () => router.push(`/build/${project.id}?prompt=${encodeURIComponent(wiringPrompt)}`),
        },
      ],
    );
  }

  function doUnpublish() {
    if (!project) return;
    Alert.alert(t('takeOffline'), t('takeOfflineBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('takeOfflineAction'),
        style: 'destructive',
        onPress: async () => {
          setPublishing(true);
          try {
            await unpublishProject(project.id);
            await load();
          } catch (e: any) {
            Alert.alert(t('failed'), e?.message ?? String(e));
          } finally {
            setPublishing(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: project?.name ?? t('project'), headerBackTitle: t('projects') }} />
      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Couldn't load this project.</Text>
          <Pressable onPress={() => { setLoading(true); load(); }} hitSlop={8} style={{ marginTop: space.md }}>
            <Text style={[styles.muted, { color: brand.accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : !project ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t('projectNotFound')}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {project.thumbnail_url ? (
            <Image
              source={{ uri: project.thumbnail_url }}
              style={styles.thumb}
              contentFit="cover"
              transition={200}
            />
          ) : null}

          {editingName ? (
            <View style={styles.renameRow}>
              <TextInput
                style={styles.renameInput}
                value={draftName}
                onChangeText={setDraftName}
                autoFocus
                maxLength={60}
                onSubmitEditing={saveName}
                returnKeyType="done"
              />
              <Pressable onPress={saveName} hitSlop={8} style={styles.renameBtn}>
                {savingName ? (
                  <ActivityIndicator size="small" color={brand.accent} />
                ) : (
                  <Ionicons name="checkmark" size={22} color={brand.accent} />
                )}
              </Pressable>
              <Pressable onPress={() => setEditingName(false)} hitSlop={8} style={styles.renameBtn}>
                <Ionicons name="close" size={22} color={brand.textMuted} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.titleRow}>
              <Text style={styles.title}>{project.name || t('untitled')}</Text>
              <Pressable
                onPress={() => {
                  tap();
                  setDraftName(project.name ?? '');
                  setEditingName(true);
                }}
                hitSlop={10}
              >
                <Ionicons name="pencil-outline" size={18} color={brand.textMuted} />
              </Pressable>
            </View>
          )}
          {project.description ? (
            <Text style={styles.desc}>{project.description}</Text>
          ) : null}

          {project.project_type === 'website' ? (
            <WebsiteLaunchChecklist
              projectId={project.id}
              isPublic={!!project.is_public}
              customDomain={project.custom_domain}
              domainVerified={!!project.custom_domain_verified}
              onOpenBuilder={() => navigateOnce(`/build/${project.id}` as Href)}
              onOpenSeo={() => navigateOnce(`/seo/${project.id}` as Href)}
              onPublish={() => doPublish(false)}
              onDomain={() => setDomainOpen(true)}
            />
          ) : null}

          <View style={styles.metaCard}>
            <MetaRow label={t('status')} value={live ? tp('live') : tp('draft')} />
            <MetaRow label={t('framework')} value={project.framework} />
            {live ? <MetaRow label={t('url')} value={live.replace(/^https?:\/\//, '')} /> : null}
            <MetaRow label={t('updated')} value={new Date(project.updated_at).toLocaleString()} />
          </View>

          <PreviewActivityCard projectId={project.id} />

          <Pressable
            onPress={() => router.push(`/build/${project.id}`)}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Ionicons name="construct-outline" size={18} color={brand.onAccent} />
            <Text style={styles.primaryText}>{t('editInBuilder')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/preview/${project.id}`)}
            style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
          >
            <Ionicons name="play-outline" size={18} color={brand.text} />
            <Text style={styles.secondaryText}>{t('previewBuild')}</Text>
          </Pressable>

          {/* Project tools — Lovable-parity: source, history, instant themes. */}
          <View style={styles.toolsCard}>
            <ToolRow
              icon="color-palette-outline"
              label={t('themes')}
              hint={t('themesHint')}
              onPress={() => router.push(`/themes/${project.id}`)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="time-outline"
              label={t('versionHistory')}
              hint={t('versionHistoryHint')}
              onPress={() => router.push(`/versions/${project.id}`)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="code-slash-outline"
              label={t('viewCode')}
              hint={t('viewCodeHint')}
              onPress={() => router.push(`/code/${project.id}`)}
            />
            {india && !isMobileProject(project) ? (
              <>
                <View style={styles.toolDivider} />
                <ToolRow
                  icon="trending-up-outline"
                  label="Grow"
                  hint="WhatsApp, UPI, Google listing"
                  onPress={() => navigateOnce(`/grow/${project.id}` as Href)}
                />
              </>
            ) : null}
            {live ? (
              <>
                <View style={styles.toolDivider} />
                <ToolRow
                  icon="megaphone-outline"
                  label="Launch kit"
                  hint="Share card, QR, launch posts"
                  onPress={() => navigateOnce(`/launch-kit/${project.id}` as Href)}
                />
                <View style={styles.toolDivider} />
                <ToolRow
                  icon="stats-chart-outline"
                  label="Analytics"
                  hint="Visitors and top pages"
                  onPress={() => navigateOnce(`/analytics/${project.id}` as Href)}
                />
                <View style={styles.toolDivider} />
                <ToolRow
                  icon="chatbubble-ellipses-outline"
                  label="Feedback"
                  hint="Comments left on your live app"
                  onPress={() => navigateOnce(`/feedback/${project.id}` as Href)}
                />
              </>
            ) : null}
            <View style={styles.toolDivider} />
            <ToolRow
              icon={duplicating ? 'hourglass-outline' : 'copy-outline'}
              label="Duplicate"
              hint="Fork this into a new project you own"
              onPress={doDuplicate}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="shield-checkmark-outline"
              label="Security scan"
              hint="Check for data leaks"
              onPress={() => navigateOnce(`/security-scan/${project.id}` as Href)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="server-outline"
              label="Database"
              hint="Status & tables"
              onPress={() => navigateOnce(`/database-status/${project.id}` as Href)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="search-outline"
              label="SEO check"
              hint="Meta, OG, sitemap"
              onPress={() => navigateOnce(`/seo/${project.id}` as Href)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="people-outline"
              label="Team"
              hint="Manage collaborators"
              onPress={() => navigateOnce(`/collaborators/${project.id}` as Href)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="card-outline"
              label="Payments"
              hint="Wire up a provider"
              onPress={() => setPaymentsOpen(true)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="link-outline"
              label="Custom domain"
              hint={project.custom_domain ?? 'Connect or buy one'}
              onPress={() => setDomainOpen(true)}
            />
          </View>

          {/* Publish — all project types can be published to a live URL */}
          <Pressable
            onPress={() => doPublish(false)}
            disabled={publishing}
            style={({ pressed }) => [styles.primary, (pressed || publishing) && styles.primaryPressed]}
          >
            {publishing ? (
              <>
                <ActivityIndicator color={brand.onAccent} />
                <Text style={styles.primaryText}>{t('publishing')}</Text>
              </>
            ) : (
              <>
                <Ionicons name="rocket-outline" size={18} color={brand.onAccent} />
                <Text style={styles.primaryText}>{live ? t('republish') : t('publish')}</Text>
              </>
            )}
          </Pressable>

          {live ? (
            <>
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(live)}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="open-outline" size={18} color={brand.text} />
                <Text style={styles.secondaryText}>{t('openLiveApp')}</Text>
              </Pressable>
              <Pressable
                onPress={() => Share.share({ message: live, url: live })}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="share-outline" size={18} color={brand.text} />
                <Text style={styles.secondaryText}>{t('share')}</Text>
              </Pressable>
              <Pressable
                onPress={doUnpublish}
                disabled={publishing}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="cloud-offline-outline" size={18} color={brand.danger} />
                <Text style={[styles.secondaryText, { color: brand.danger }]}>{t('takeOfflineAction')}</Text>
              </Pressable>
            </>
          ) : isMobile ? (
            <>
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(`${API_BASE}/m/${project.id}`).catch(() => {})}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="globe-outline" size={18} color={brand.text} />
                <Text style={styles.secondaryText}>{t('testInBrowser')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const url = `${API_BASE}/m/${project.id}`;
                  Share.share({ message: url, url }).catch(() => {});
                }}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="share-outline" size={18} color={brand.text} />
                <Text style={styles.secondaryText}>{t('sharePreviewLink')}</Text>
              </Pressable>
              <Pressable
                onPress={doOpenOnDevice}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="phone-portrait-outline" size={18} color={brand.text} />
                <Text style={styles.secondaryText}>{t('openOnDevice')}</Text>
              </Pressable>
              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={18} color={brand.textMuted} />
                <Text style={styles.noticeText}>{t('mobileNotice')}</Text>
              </View>
            </>
          ) : null}

          <Pressable onPress={doDelete} hitSlop={8} style={styles.deleteRow}>
            <Ionicons name="trash-outline" size={15} color={brand.danger} />
            <Text style={styles.deleteText}>{t('deleteApp')}</Text>
          </Pressable>
        </ScrollView>
      )}

      <BottomSheet
        visible={paymentsOpen}
        title="Add payments"
        subtitle="Choose a provider to wire into this project"
        onClose={() => setPaymentsOpen(false)}
        actions={[
          {
            icon: 'card-outline',
            label: 'Stripe',
            onPress: () =>
              wirePayments('Stripe', ['STRIPE_SECRET_KEY'], 'Add Stripe payment integration with checkout, subscriptions, and webhook handling.'),
          },
          {
            icon: 'card-outline',
            label: 'Razorpay',
            onPress: () =>
              wirePayments('Razorpay', ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'], 'Add Razorpay payment gateway with checkout and subscription billing.'),
          },
          {
            icon: 'card-outline',
            label: 'Lemon Squeezy',
            onPress: () =>
              wirePayments('Lemon Squeezy', ['LEMONSQUEEZY_API_KEY'], 'Add Lemon Squeezy for product sales with checkout overlay and license key validation.'),
          },
        ]}
      />

      {project ? (
        <DomainSheet
          visible={domainOpen}
          projectId={project.id}
          currentDomain={project.custom_domain}
          currentDomainVerified={project.custom_domain_verified}
          onClose={() => setDomainOpen(false)}
          onChanged={load}
        />
      ) : null}
    </>
  );
}

function ToolRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toolRow, pressed && { backgroundColor: brand.surfaceAlt }]}
    >
      <Ionicons name={icon} size={19} color={brand.accent} />
      <Text style={styles.toolLabel}>{label}</Text>
      <Text style={styles.toolHint}>{hint}</Text>
      <Ionicons name="chevron-forward" size={16} color={brand.textFaint} />
    </Pressable>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.bg },
  muted: { color: brand.textMuted, fontSize: 15 },
  title: { color: brand.text, fontSize: 26, fontFamily: font.display, letterSpacing: -0.5 },
  desc: { color: brand.textMuted, fontSize: 15, lineHeight: 21 },
  metaCard: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
    marginTop: space.sm,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  metaLabel: { color: brand.textFaint, fontSize: 13 },
  metaValue: { color: brand.text, fontSize: 13, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    marginTop: space.sm,
  },
  primaryPressed: { backgroundColor: brand.accentDim },
  primaryText: { color: brand.onAccent, fontSize: 16, fontWeight: '700' },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
  },
  secondaryPressed: { backgroundColor: brand.surfaceAlt },
  secondaryText: { color: brand.text, fontSize: 16, fontWeight: '600' },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
  },
  noticeText: { color: brand.textMuted, fontSize: 13, lineHeight: 19, flex: 1 },
  thumb: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  renameInput: {
    flex: 1,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.accent,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 18,
    fontWeight: '700',
  },
  renameBtn: { padding: space.xs },
  toolsCard: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: space.sm,
  },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md + 2 },
  toolLabel: { color: brand.text, fontSize: 15, fontWeight: '600' },
  toolHint: { color: brand.textFaint, fontSize: 12, flex: 1, textAlign: 'right' },
  toolDivider: { height: 1, backgroundColor: brand.border, marginLeft: space.lg + 19 + space.md },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.md,
    marginTop: space.sm,
  },
  deleteText: { color: brand.danger, fontSize: 13.5, fontWeight: '600' },
});
