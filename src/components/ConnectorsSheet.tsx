import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CONNECTORS, connectorConnected, type Connector } from '@/lib/connectors';
import { listSecretNames, saveSecret, type FileMap } from '@/lib/api';
import { GoLiveChecklist } from '@/components/GoLiveChecklist';
import { tap, success } from '@/lib/haptics';
import { useT } from '@/lib/i18n/useT';
import { CONNECTORS_SHEET_STRINGS } from '@/lib/i18n/dict/connectors-sheet';
import { brand, font, radius, space } from '@/lib/theme';

// Add an integration to the current build from the phone: pick a service, drop
// in its API key(s) → saved to the vault → the connector's prompt is sent to the
// builder so the AI wires it in. Mirrors the web ConnectorsPanel (key-based
// connectors only; Supabase/OAuth deferred). `onRun` hands the prompt to the
// builder's existing run().
export function ConnectorsSheet({
  visible,
  onClose,
  onRun,
  projectId,
  projectName,
  files,
}: {
  visible: boolean;
  onClose: () => void;
  onRun: (prompt: string) => void;
  projectId?: string;
  projectName?: string;
  files?: FileMap;
}) {
  const insets = useSafeAreaInsets();
  const t = useT(CONNECTORS_SHEET_STRINGS);
  const [search, setSearch] = useState('');
  const [vault, setVault] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Connector | null>(null);
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) listSecretNames().then(setVault).catch(() => {});
  }, [visible]);

  // Reset the detail view whenever the sheet reopens/closes.
  useEffect(() => {
    if (!visible) {
      // Legitimate prop-driven reset (clear form state when the sheet closes).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelected(null);
      setKeyValues({});
      setSearch('');
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CONNECTORS;
    return CONNECTORS.filter(
      (c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
    );
  }, [search]);

  function runAndClose(prompt: string) {
    onClose();
    // Let the sheet dismiss before the builder starts streaming.
    setTimeout(() => onRun(prompt), 60);
  }

  function pick(c: Connector) {
    tap();
    // No key needed, or every key already in the vault → just build.
    if (!c.secretKeys?.length || connectorConnected(c, vault)) {
      runAndClose(c.prompt);
      return;
    }
    setSelected(c);
    setKeyValues({});
  }

  async function connect() {
    if (!selected || saving) return;
    const keys = selected.secretKeys ?? [];
    const missing = keys.filter((k) => !(keyValues[k.name] || '').trim());
    if (missing.length) {
      Alert.alert(t('addYourKey'), t('enterKeysToConnect').replace('{keys}', missing.map((k) => k.name).join(', ')).replace('{name}', selected.name));
      return;
    }
    setSaving(true);
    try {
      for (const k of keys) await saveSecret(k.name, (keyValues[k.name] || '').trim());
      success();
      runAndClose(selected.prompt);
    } catch (e) {
      Alert.alert(t('couldntConnect'), (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
          <View style={styles.headerRow}>
            {selected ? (
              <Pressable onPress={() => setSelected(null)} hitSlop={10}>
                <Ionicons name="chevron-back" size={24} color={brand.accent} />
              </Pressable>
            ) : (
              <View style={{ width: 24 }} />
            )}
            <Text style={styles.title}>{selected ? selected.name : t('connectors')}</Text>
            <Pressable onPress={() => { tap(); onClose(); }} hitSlop={10}>
              <Ionicons name="close" size={24} color={brand.textMuted} />
            </Pressable>
          </View>
          {!selected ? (
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={15} color={brand.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('searchIntegrations')}
                placeholderTextColor={brand.textFaint}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}
        </View>

        {selected ? (
          <ScrollView contentContainerStyle={styles.detail} keyboardShouldPersistTaps="handled">
            <Text style={styles.detailDesc}>{selected.desc}</Text>
            <Text style={styles.detailHint}>
              {t('pasteKeyHint').replace('{name}', selected.name).replace('{s}', (selected.secretKeys?.length ?? 0) > 1 ? 's' : '')}
            </Text>
            {(selected.secretKeys ?? []).map((k) => (
              <View key={k.name} style={styles.field}>
                <Text style={styles.fieldLabel}>{k.name}</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder={k.placeholder}
                  placeholderTextColor={brand.textFaint}
                  value={keyValues[k.name] || ''}
                  onChangeText={(v) => setKeyValues((s) => ({ ...s, [k.name]: v }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>
            ))}
            <Pressable
              onPress={connect}
              disabled={saving}
              style={({ pressed }) => [styles.connectBtn, (pressed || saving) && styles.connectBtnPressed]}
            >
              {saving ? (
                <>
                  <ActivityIndicator color={brand.onAccent} />
                  <Text style={styles.connectText}>{t('connecting')}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="link" size={16} color={brand.onAccent} />
                  <Text style={styles.connectText}>{t('connectAndBuild')}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {projectId ? (
              <GoLiveChecklist projectId={projectId} projectName={projectName} files={files ?? {}} visible={visible} />
            ) : null}
            {filtered.map((c) => {
              const connected = connectorConnected(c, vault);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => pick(c)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={[styles.iconWell, { backgroundColor: c.color + '22', borderColor: c.color + '44' }]}>
                    <Text style={styles.iconGlyph}>{c.icon}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{c.name}</Text>
                    <Text style={styles.rowDesc} numberOfLines={1}>{c.desc}</Text>
                  </View>
                  {connected ? (
                    <View style={styles.connectedTag}>
                      <Ionicons name="checkmark-circle" size={14} color={brand.success} />
                      <Text style={styles.connectedText}>{t('added')}</Text>
                    </View>
                  ) : (
                    <Ionicons name="add-circle-outline" size={22} color={brand.accent} />
                  )}
                </Pressable>
              );
            })}
            {filtered.length === 0 ? <Text style={styles.empty}>{t('noIntegrationsMatch').replace('{search}', search)}</Text> : null}
            <Text style={styles.footnote}>
              {t('supabaseFootnote')}
            </Text>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.bg },
  header: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    backgroundColor: brand.surface,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: brand.text, fontSize: 18, fontFamily: font.display, letterSpacing: -0.3 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    marginTop: space.md,
  },
  searchInput: { flex: 1, color: brand.text, fontSize: 14, paddingVertical: space.sm + 2 },
  list: { padding: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    padding: space.md,
  },
  rowPressed: { backgroundColor: brand.surfaceAlt, transform: [{ scale: 0.99 }] },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: { fontSize: 18 },
  rowText: { flex: 1, gap: 1 },
  rowName: { color: brand.text, fontSize: 14.5, fontWeight: '700' },
  rowDesc: { color: brand.textFaint, fontSize: 12 },
  connectedTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  connectedText: { color: brand.success, fontSize: 11.5, fontWeight: '700' },
  empty: { color: brand.textMuted, fontSize: 13, textAlign: 'center', marginTop: space.lg },
  footnote: { color: brand.textFaint, fontSize: 12, textAlign: 'center', marginTop: space.md, lineHeight: 17 },
  detail: { padding: space.lg, gap: space.md },
  detailDesc: { color: brand.textMuted, fontSize: 14 },
  detailHint: { color: brand.textFaint, fontSize: 12.5, lineHeight: 18 },
  field: { gap: 6 },
  fieldLabel: { color: brand.textMuted, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 },
  fieldInput: {
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 14,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: 13,
    marginTop: space.sm,
  },
  connectBtnPressed: { backgroundColor: brand.accentDim },
  connectText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
});
