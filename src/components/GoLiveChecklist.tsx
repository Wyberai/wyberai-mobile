import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { deployProject, listSecretNames, saveSecret, type FileMap } from '@/lib/api';
import { planGoLive } from '@/lib/go-live';
import { tap, success } from '@/lib/haptics';
import { useT } from '@/lib/i18n/useT';
import { GO_LIVE_STRINGS } from '@/lib/i18n/dict/go-live';
import { brand, radius, space } from '@/lib/theme';

// Mirrors web's GoLiveChecklist: one checklist of everything the app's own api/
// functions read from the environment. Values go to the owner's encrypted vault
// (/api/secrets) and are passed to the live app as environment variables at
// deploy. Renders nothing for apps with no server code.
export function GoLiveChecklist({
  projectId,
  projectName,
  files,
  visible,
}: {
  projectId: string;
  projectName?: string;
  files: FileMap;
  visible: boolean;
}) {
  const t = useT(GO_LIVE_STRINGS);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'saving' | 'deploying' | null>(null);
  const [message, setMessage] = useState('');
  const [liveUrl, setLiveUrl] = useState('');

  const loadVault = useCallback(() => {
    listSecretNames().then(setSaved).catch(() => {});
  }, []);
  useEffect(() => {
    if (visible) loadVault();
  }, [visible, loadVault]);

  const plan = useMemo(() => planGoLive(files ?? {}, saved), [files, saved]);
  if (!plan.items.length && !plan.other.length) return null;

  const pending = Object.entries(draft).filter(([, v]) => v.trim());
  const allConnected = plan.items.every((i) => i.connected) && plan.other.every((n) => saved.has(n));
  const remaining = plan.items.filter((i) => !i.connected).length;
  const s = (n: number) => (n === 1 ? '' : 's');

  async function save() {
    tap();
    setBusy('saving');
    setMessage('');
    let current = '';
    try {
      for (const [name, value] of pending) {
        current = name;
        await saveSecret(name, value.trim());
      }
      success();
      setDraft({});
      loadVault();
      setMessage(t('savedN').replace('{count}', String(pending.length)).replace('{s}', s(pending.length)));
    } catch {
      setMessage(t('couldntSave').replace('{name}', current));
    }
    setBusy(null);
  }

  async function goLive() {
    tap();
    setBusy('deploying');
    setMessage(t('deployingMsg'));
    const r = await deployProject(projectId, files, projectName ?? 'wyber-app');
    if (r.ok) {
      success();
      setLiveUrl(r.url);
      setMessage(t('live'));
    } else {
      setMessage(r.error || t('deployFailed'));
    }
    setBusy(null);
  }

  const canDeploy = busy === null && !!projectId && pending.length === 0 && allConnected;

  return (
    <View style={styles.card} accessibilityLabel={t('title')}>
      <Text style={styles.title}>{t('title')}</Text>
      <Text style={styles.intro}>
        {allConnected
          ? t('allSaved')
          : t('stillNeed').replace('{n}', String(remaining)).replace('{s}', s(remaining))}
      </Text>

      {plan.items.map(({ service, missing, connected }) => (
        <View key={service.id} style={styles.service}>
          <View style={styles.serviceHead}>
            <Text style={styles.serviceName}>{service.label}</Text>
            <Text style={[styles.chip, connected ? styles.chipOk : styles.chipWarn]}>
              {connected ? t('connected') : t('needsSetup')}
            </Text>
          </View>
          {!connected ? (
            <>
              <Text style={styles.where}>{service.where}</Text>
              <Pressable onPress={() => Linking.openURL(service.keyUrl).catch(() => {})} hitSlop={8}>
                <Text style={styles.link}>{t('openProvider')}</Text>
              </Pressable>
              {missing.map((v) => (
                <View key={v.name} style={styles.field}>
                  <Text style={styles.fieldLabel}>
                    {v.label} <Text style={styles.mono}>{v.name}</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={v.placeholder ?? ''}
                    placeholderTextColor={brand.textFaint}
                    value={draft[v.name] ?? ''}
                    onChangeText={(x) => setDraft((d) => ({ ...d, [v.name]: x }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={v.secret}
                  />
                </View>
              ))}
            </>
          ) : null}
        </View>
      ))}

      {plan.other
        .filter((n) => !saved.has(n))
        .map((name) => (
          <View key={name} style={styles.field}>
            <Text style={styles.fieldLabel}>
              {t('usedByApp')} <Text style={styles.mono}>{name}</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={draft[name] ?? ''}
              onChangeText={(x) => setDraft((d) => ({ ...d, [name]: x }))}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
        ))}

      <View style={styles.actions}>
        {pending.length > 0 ? (
          <Pressable
            onPress={save}
            disabled={busy !== null}
            style={({ pressed }) => [styles.btn, styles.btnPrimary, (pressed || busy !== null) && styles.btnDim]}
          >
            <Text style={styles.btnPrimaryText}>
              {busy === 'saving'
                ? t('saving')
                : t('saveN').replace('{count}', String(pending.length)).replace('{s}', s(pending.length))}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={goLive}
          disabled={!canDeploy}
          style={({ pressed }) => [styles.btn, canDeploy ? styles.btnGo : styles.btnOff, pressed && styles.btnDim]}
        >
          {busy === 'deploying' ? <ActivityIndicator color={brand.onAccent} /> : null}
          <Text style={canDeploy ? styles.btnGoText : styles.btnOffText}>
            {busy === 'deploying' ? t('deploying') : t('deploy')}
          </Text>
        </Pressable>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {liveUrl ? (
        <Pressable onPress={() => Linking.openURL(liveUrl).catch(() => {})} hitSlop={8}>
          <Text style={styles.link}>{liveUrl}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: brand.accent + '59',
    backgroundColor: brand.accent + '0D',
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.sm,
  },
  title: { color: brand.text, fontSize: 15, fontWeight: '700' },
  intro: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18 },
  service: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
  },
  serviceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceName: { color: brand.text, fontSize: 14, fontWeight: '600', flex: 1 },
  chip: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  chipOk: { color: brand.success, backgroundColor: brand.success + '1F' },
  chipWarn: { color: '#f59e0b', backgroundColor: '#f59e0b1F' },
  where: { color: brand.textFaint, fontSize: 12, lineHeight: 17 },
  link: { color: brand.accent, fontSize: 12.5, fontWeight: '600' },
  field: { gap: 4 },
  fieldLabel: { color: brand.textMuted, fontSize: 11.5 },
  mono: { fontFamily: 'monospace', opacity: 0.7 },
  input: {
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 14,
  },
  actions: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginTop: space.xs },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: space.lg,
  },
  btnPrimary: { backgroundColor: brand.accent },
  btnPrimaryText: { color: brand.onAccent, fontSize: 14, fontWeight: '700' },
  btnGo: { backgroundColor: brand.success },
  btnGoText: { color: brand.onAccent, fontSize: 14, fontWeight: '700' },
  btnOff: { borderWidth: 1, borderColor: brand.border },
  btnOffText: { color: brand.textFaint, fontSize: 14, fontWeight: '700' },
  btnDim: { opacity: 0.7 },
  message: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18 },
});
