import { useCallback, useEffect, useState } from 'react';
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { projectUrl, isMobileProject, type Project } from '@/lib/types';
import { deleteProject, publishProject, renameProject, unpublishProject } from '@/lib/api';
import { tap, warn } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Spinner';
import { brand, font, radius, space } from '@/lib/theme';

const SELECT =
  'id,user_id,name,description,framework,project_type,subdomain,published_url,deployed_url,custom_domain,thumbnail_url,created_at,updated_at';

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const showToast = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('projects').select(SELECT).eq('id', id).maybeSingle();
    setProject((data as Project) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const live = project ? projectUrl(project) : null;
  const isMobile = project ? isMobileProject(project) : false;

  async function doPublish(override = false) {
    if (!project) return;
    setPublishing(true);
    const result = await publishProject(project.id, override);
    setPublishing(false);
    if (result.ok) {
      await load();
      Alert.alert('Published 🎉', `🔒 Security-checked, then published live.\n\n${result.publishedUrl}`);
    } else if (result.blocked) {
      // Critical RLS leak — same "publish anyway" escape hatch as the web editor.
      Alert.alert('Security check', result.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish anyway', style: 'destructive', onPress: () => doPublish(true) },
      ]);
    } else {
      Alert.alert('Publish failed', result.error);
    }
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
      showToast('Renamed');
    } catch (e) {
      Alert.alert('Rename failed', (e as Error).message);
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  }

  function doDelete() {
    if (!project) return;
    warn();
    Alert.alert(
      'Delete this app?',
      `"${project.name || 'Untitled'}" and its full history will be permanently deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProject(project.id);
              router.back();
            } catch (e) {
              Alert.alert('Delete failed', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  function doUnpublish() {
    if (!project) return;
    Alert.alert('Take offline?', 'This removes the live link. You can republish anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take offline',
        style: 'destructive',
        onPress: async () => {
          setPublishing(true);
          try {
            await unpublishProject(project.id);
            await load();
          } catch (e: any) {
            Alert.alert('Failed', e?.message ?? String(e));
          } finally {
            setPublishing(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: project?.name ?? 'Project', headerBackTitle: 'Projects' }} />
      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : !project ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Project not found.</Text>
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
              <Text style={styles.title}>{project.name || 'Untitled'}</Text>
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

          <View style={styles.metaCard}>
            <MetaRow label="Status" value={live ? 'Live' : 'Draft'} />
            <MetaRow label="Framework" value={project.framework} />
            {live ? <MetaRow label="URL" value={live.replace(/^https?:\/\//, '')} /> : null}
            <MetaRow label="Updated" value={new Date(project.updated_at).toLocaleString()} />
          </View>

          <Pressable
            onPress={() => router.push(`/build/${project.id}`)}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Ionicons name="construct-outline" size={18} color={brand.onAccent} />
            <Text style={styles.primaryText}>Edit in builder</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/preview/${project.id}`)}
            style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
          >
            <Ionicons name="play-outline" size={18} color={brand.text} />
            <Text style={styles.secondaryText}>Preview build</Text>
          </Pressable>

          {/* Project tools — Lovable-parity: source, history, instant themes. */}
          <View style={styles.toolsCard}>
            <ToolRow
              icon="color-palette-outline"
              label="Themes"
              hint="Retheme instantly · free"
              onPress={() => router.push(`/themes/${project.id}`)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="time-outline"
              label="Version history"
              hint="Restore any build"
              onPress={() => router.push(`/versions/${project.id}`)}
            />
            <View style={styles.toolDivider} />
            <ToolRow
              icon="code-slash-outline"
              label="View code"
              hint="Every file, yours"
              onPress={() => router.push(`/code/${project.id}`)}
            />
          </View>

          {/* Publish is web-only. Mobile (RN) projects export to Expo/EAS. */}
          {!isMobile ? (
            <Pressable
              onPress={() => doPublish(false)}
              disabled={publishing}
              style={({ pressed }) => [styles.primary, (pressed || publishing) && styles.primaryPressed]}
            >
              {publishing ? (
                <ActivityIndicator color={brand.onAccent} />
              ) : (
                <>
                  <Ionicons name="rocket-outline" size={18} color={brand.onAccent} />
                  <Text style={styles.primaryText}>{live ? 'Republish' : 'Publish'}</Text>
                </>
              )}
            </Pressable>
          ) : null}

          {live ? (
            <>
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(live)}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="open-outline" size={18} color={brand.text} />
                <Text style={styles.secondaryText}>Open live app</Text>
              </Pressable>
              <Pressable
                onPress={() => Share.share({ message: live, url: live })}
                style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
              >
                <Ionicons name="share-outline" size={18} color={brand.text} />
                <Text style={styles.secondaryText}>Share</Text>
              </Pressable>
              {!isMobile ? (
                <Pressable
                  onPress={doUnpublish}
                  disabled={publishing}
                  style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
                >
                  <Ionicons name="cloud-offline-outline" size={18} color={brand.danger} />
                  <Text style={[styles.secondaryText, { color: brand.danger }]}>Take offline</Text>
                </Pressable>
              ) : null}
            </>
          ) : isMobile ? (
            <View style={styles.notice}>
              <Ionicons name="phone-portrait-outline" size={18} color={brand.textMuted} />
              <Text style={styles.noticeText}>
                Mobile apps are exported to Expo (EAS) to build for the App Store &amp; Play Store —
                coming soon. Use Preview to see it running now.
              </Text>
            </View>
          ) : null}

          <Pressable onPress={doDelete} hitSlop={8} style={styles.deleteRow}>
            <Ionicons name="trash-outline" size={15} color={brand.danger} />
            <Text style={styles.deleteText}>Delete app</Text>
          </Pressable>
        </ScrollView>
      )}
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
