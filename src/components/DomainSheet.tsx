import { useState } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  connectCustomDomain,
  purchaseDomain,
  removeCustomDomain,
  searchDomain,
  type ConnectDomainResult,
  type DomainContactInfo,
} from '@/lib/api';
import { tap, warn } from '@/lib/haptics';
import { brand, font, radius, space } from '@/lib/theme';

type Mode = 'connect' | 'buy';

const EMPTY_CONTACT: DomainContactInfo = {
  firstName: '', lastName: '', email: '', phone: '',
  address1: '', city: '', state: '', zip: '', country: '',
};

export function DomainSheet({
  visible,
  projectId,
  currentDomain,
  currentDomainVerified,
  onClose,
  onChanged,
}: {
  visible: boolean;
  projectId: string;
  currentDomain: string | null;
  currentDomainVerified: boolean | null;
  onClose: () => void;
  onChanged: () => void; // caller refetches the project after a connect/remove
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('connect');

  // Connect/verify state
  const [domainInput, setDomainInput] = useState(currentDomain ?? '');
  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState<ConnectDomainResult | null>(null);

  // Buy state
  const [searchName, setSearchName] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{ available: boolean; priceCents: number | null } | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contact, setContact] = useState<DomainContactInfo>(EMPTY_CONTACT);
  const [buying, setBuying] = useState(false);

  async function onConnect() {
    const domain = domainInput.trim().toLowerCase();
    if (!domain || connecting) return;
    tap();
    setConnecting(true);
    setResult(null);
    try {
      const r = await connectCustomDomain(projectId, domain);
      setResult(r);
      if (r.error && r.verified === undefined) warn();
    } catch (e) {
      Alert.alert('Could not connect domain', (e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  async function onVerify() {
    const domain = domainInput.trim().toLowerCase();
    if (!domain || verifying) return;
    tap();
    setVerifying(true);
    try {
      const r = await connectCustomDomain(projectId, domain, 'verify');
      setResult(r);
      if (r.verified) {
        onChanged();
      } else {
        warn();
      }
    } catch (e) {
      Alert.alert('Could not verify domain', (e as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  function onRemove() {
    Alert.alert('Disconnect domain?', `${currentDomain} will stop pointing at this project.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          try {
            await removeCustomDomain(projectId);
            setDomainInput('');
            setResult(null);
            onChanged();
          } catch (e) {
            Alert.alert('Could not remove domain', (e as Error).message);
          } finally {
            setRemoving(false);
          }
        },
      },
    ]);
  }

  async function onSearch() {
    const name = searchName.trim().toLowerCase();
    if (!name || searching) return;
    tap();
    setSearching(true);
    setSearchResult(null);
    setShowContactForm(false);
    try {
      const r = await searchDomain(name);
      setSearchResult({ available: r.available, priceCents: r.priceCents });
    } catch (e) {
      Alert.alert('Search failed', (e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function onBuy() {
    const required: (keyof DomainContactInfo)[] = ['firstName', 'lastName', 'email', 'phone', 'address1', 'city', 'state', 'zip', 'country'];
    const missing = required.filter((f) => !contact[f].trim());
    if (missing.length > 0) {
      Alert.alert('A few details are missing', `Fill in: ${missing.join(', ')}`);
      return;
    }
    if (!searchResult?.priceCents || buying) return;
    tap();
    setBuying(true);
    try {
      const { url } = await purchaseDomain({
        projectId,
        domain: searchName.trim().toLowerCase(),
        priceCents: searchResult.priceCents,
        contactInfo: contact,
      });
      await WebBrowser.openBrowserAsync(url);
      onClose();
      onChanged(); // matches onVerify/onRemove — lets the project screen pick up the connection once the webhook lands
      Alert.alert('Purchase received', "We'll connect this domain to your project once payment completes.");
    } catch (e) {
      Alert.alert('Could not complete purchase', (e as Error).message);
    } finally {
      setBuying(false);
    }
  }

  const record = result?.instructions?.record;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top || space.md }]}>
          <Text style={styles.headerTitle}>Custom domain</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={brand.textMuted} />
          </Pressable>
        </View>

        <View style={styles.segRow}>
          <Pressable style={[styles.seg, mode === 'connect' && styles.segActive]} onPress={() => setMode('connect')}>
            <Text style={[styles.segText, mode === 'connect' && styles.segTextActive]}>Connect existing</Text>
          </Pressable>
          <Pressable style={[styles.seg, mode === 'buy' && styles.segActive]} onPress={() => setMode('buy')}>
            <Text style={[styles.segText, mode === 'buy' && styles.segTextActive]}>Buy new</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {mode === 'connect' ? (
            <>
              {currentDomain ? (
                <View style={styles.statusCard}>
                  <Ionicons
                    name={currentDomainVerified ? 'checkmark-circle' : 'time-outline'}
                    size={18}
                    color={currentDomainVerified ? brand.accent : brand.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statusTitle}>{currentDomain}</Text>
                    <Text style={styles.statusSub}>{currentDomainVerified ? 'Connected' : 'Pending verification'}</Text>
                  </View>
                  <Pressable onPress={onRemove} disabled={removing} hitSlop={8}>
                    {removing ? <ActivityIndicator color={brand.danger} /> : (
                      <Text style={styles.removeText}>Remove</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              <Text style={styles.label}>Domain you already own</Text>
              <TextInput
                style={styles.input}
                placeholder="example.com"
                placeholderTextColor={brand.textFaint}
                value={domainInput}
                onChangeText={setDomainInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Pressable onPress={onConnect} disabled={connecting || !domainInput.trim()} style={[styles.cta, (connecting || !domainInput.trim()) && styles.ctaDisabled]}>
                {connecting ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.ctaText}>Connect</Text>}
              </Pressable>

              {result?.error ? <Text style={styles.error}>{result.error}</Text> : null}
              {result?.message ? <Text style={styles.success}>{result.message}</Text> : null}

              {record ? (
                <View style={styles.recordCard}>
                  <Text style={styles.recordTitle}>Add this DNS record</Text>
                  <Text style={styles.recordLine}>Type: {record.type}</Text>
                  <Text style={styles.recordLine}>Name: {record.name}</Text>
                  <Text style={styles.recordLine}>Value: {record.value}</Text>
                  {record.message ? <Text style={styles.recordHint}>{record.message}</Text> : null}
                  <Pressable onPress={onVerify} disabled={verifying} style={[styles.cta, styles.ctaSecondary, verifying && styles.ctaDisabled]}>
                    {verifying ? <ActivityIndicator color={brand.text} /> : <Text style={[styles.ctaText, { color: brand.text }]}>Verify DNS</Text>}
                  </Pressable>
                  <Text style={styles.hint}>DNS changes can take up to 24 hours to propagate.</Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.label}>Search for a domain</Text>
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="yourbrand.com"
                  placeholderTextColor={brand.textFaint}
                  value={searchName}
                  onChangeText={setSearchName}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
                <Pressable onPress={onSearch} disabled={searching || !searchName.trim()} style={styles.searchBtn}>
                  {searching ? <ActivityIndicator color={brand.onAccent} /> : <Ionicons name="search" size={18} color={brand.onAccent} />}
                </Pressable>
              </View>

              {searchResult ? (
                searchResult.available ? (
                  <View style={styles.statusCard}>
                    <Ionicons name="checkmark-circle" size={18} color={brand.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statusTitle}>{searchName} is available</Text>
                      <Text style={styles.statusSub}>
                        {searchResult.priceCents != null ? `$${(searchResult.priceCents / 100).toFixed(2)}/year` : 'Price unavailable'}
                      </Text>
                    </View>
                    <Pressable onPress={() => setShowContactForm(true)} hitSlop={8}>
                      <Text style={styles.removeText}>Buy</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.error}>{searchName} is not available.</Text>
                )
              ) : null}

              {showContactForm ? (
                <View style={styles.recordCard}>
                  <Text style={styles.recordTitle}>Registrant details</Text>
                  <Text style={styles.hint}>Required by ICANN for any domain purchase.</Text>
                  <ContactField label="First name" value={contact.firstName} onChangeText={(v) => setContact((c) => ({ ...c, firstName: v }))} />
                  <ContactField label="Last name" value={contact.lastName} onChangeText={(v) => setContact((c) => ({ ...c, lastName: v }))} />
                  <ContactField label="Email" value={contact.email} onChangeText={(v) => setContact((c) => ({ ...c, email: v }))} keyboardType="email-address" />
                  <ContactField label="Phone" value={contact.phone} onChangeText={(v) => setContact((c) => ({ ...c, phone: v }))} keyboardType="phone-pad" />
                  <ContactField label="Address" value={contact.address1} onChangeText={(v) => setContact((c) => ({ ...c, address1: v }))} />
                  <ContactField label="City" value={contact.city} onChangeText={(v) => setContact((c) => ({ ...c, city: v }))} />
                  <ContactField label="State" value={contact.state} onChangeText={(v) => setContact((c) => ({ ...c, state: v }))} />
                  <ContactField label="ZIP" value={contact.zip} onChangeText={(v) => setContact((c) => ({ ...c, zip: v }))} />
                  <ContactField label="Country" value={contact.country} onChangeText={(v) => setContact((c) => ({ ...c, country: v }))} placeholder="US" />
                  <Pressable onPress={onBuy} disabled={buying} style={[styles.cta, buying && styles.ctaDisabled]}>
                    {buying ? <ActivityIndicator color={brand.onAccent} /> : (
                      <Text style={styles.ctaText}>
                        Buy for {searchResult?.priceCents != null ? `$${(searchResult.priceCents / 100).toFixed(2)}` : '—'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ContactField({
  label, value, onChangeText, keyboardType, placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'email-address' | 'phone-pad' | 'default';
  placeholder?: string;
}) {
  return (
    <View style={{ marginBottom: space.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={brand.textFaint}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: brand.bg,
  },
  headerTitle: { color: brand.text, fontSize: 18, fontFamily: font.display },
  segRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: brand.bg },
  seg: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  segActive: { borderColor: brand.accent, backgroundColor: 'rgba(14,165,233,0.1)' },
  segText: { color: brand.textMuted, fontSize: 13, fontWeight: '600' },
  segTextActive: { color: brand.text },
  content: { padding: space.lg, backgroundColor: brand.bg, flexGrow: 1 },
  label: { color: brand.textMuted, fontSize: 13, fontWeight: '600', marginBottom: space.sm },
  fieldLabel: { color: brand.textFaint, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 15,
  },
  searchRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  searchBtn: { width: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: brand.accent },
  cta: {
    marginTop: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  ctaSecondary: { backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  error: { color: brand.danger, fontSize: 13, marginTop: space.sm },
  success: { color: brand.accent, fontSize: 13, marginTop: space.sm },
  hint: { color: brand.textFaint, fontSize: 11.5, lineHeight: 16, marginTop: space.xs },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  statusTitle: { color: brand.text, fontSize: 14, fontWeight: '600' },
  statusSub: { color: brand.textMuted, fontSize: 12 },
  removeText: { color: brand.accent, fontSize: 13, fontWeight: '700' },
  recordCard: {
    marginTop: space.md,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  recordTitle: { color: brand.text, fontSize: 14, fontWeight: '700', marginBottom: space.xs },
  recordLine: { color: brand.textMuted, fontSize: 13, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  recordHint: { color: brand.textFaint, fontSize: 12, marginTop: space.xs },
});
