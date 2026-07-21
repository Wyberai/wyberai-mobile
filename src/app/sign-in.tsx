import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSession } from '@/ctx/session';
import { useT } from '@/lib/i18n/useT';
import { SIGN_IN_STRINGS } from '@/lib/i18n/dict/sign-in';
import { brand, font, radius, space } from '@/lib/theme';

// The app-review account signs in with a password instead of an emailed OTP
// (reviewers can't receive our code). Overridable via env for staging.
const REVIEW_EMAIL = (
  process.env.EXPO_PUBLIC_REVIEW_EMAIL ?? 'appreview@wyberai.com'
).toLowerCase();

// Google/GitHub backends are live (same providers the web app has used for
// months), so they're ON by default. Apple stays OFF until its Supabase
// provider + Apple Service ID exist — so no dead Apple button ever ships.
// All three overridable via EAS env (EXPO_PUBLIC_ENABLE_*).
const ENABLE_GOOGLE = process.env.EXPO_PUBLIC_ENABLE_GOOGLE !== 'false';
const ENABLE_GITHUB = process.env.EXPO_PUBLIC_ENABLE_GITHUB !== 'false';
const ENABLE_APPLE = process.env.EXPO_PUBLIC_ENABLE_APPLE === 'true';

export default function SignIn() {
  const t = useT(SIGN_IN_STRINGS);
  const { signInWithProvider, signInWithApple, sendCode, verifyCode, signInWithPassword } = useSession();
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<null | 'google' | 'github'>(null);
  const [appleBusy, setAppleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!error) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [error, shake]);

  async function onApple() {
    setError(null);
    setAppleBusy(true);
    const { error } = await signInWithApple();
    setAppleBusy(false);
    if (error) setError(error);
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showApple = Platform.OS === 'ios' && ENABLE_APPLE;
  const anySocial = showApple || ENABLE_GOOGLE || ENABLE_GITHUB;

  async function onOAuth(provider: 'google' | 'github') {
    setError(null);
    setOauthBusy(provider);
    const { error } = await signInWithProvider(provider);
    setOauthBusy(null);
    if (error) setError(error);
  }

  async function onContinue() {
    setError(null);
    // Reviewer account: skip OTP, go straight to password entry.
    if (email.trim().toLowerCase() === REVIEW_EMAIL) {
      setStep('password');
      return;
    }
    setBusy(true);
    const { error } = await sendCode(email);
    setBusy(false);
    if (error) return setError(error);
    setStep('code');
  }

  async function onPasswordSignIn() {
    setError(null);
    setBusy(true);
    const { error } = await signInWithPassword(email, password);
    setBusy(false);
    if (error) setError(error);
    // On success the session lands and the root guard swaps to the app.
  }

  async function onVerify() {
    setError(null);
    setBusy(true);
    const { error } = await verifyCode(email, code);
    setBusy(false);
    if (error) setError(error);
    // On success the session lands and the root guard swaps to the app.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.brandRow}>
            <Image source={require('../../assets/images/icon.png')} style={styles.logoImg} />
            <Text style={styles.wordmark}>Wyber<Text style={{ color: brand.accent }}>Ai</Text></Text>
          </View>

          {step === 'email' ? (
            <>
              <Text style={styles.title}>{t('signIn')}</Text>
              <Text style={styles.subtitle}>{t('continueBuilding')}</Text>

              {showApple && !appleBusy ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={radius.md}
                  style={styles.appleBtn}
                  onPress={onApple}
                />
              ) : showApple ? (
                <View style={styles.oauthBtn}>
                  <ActivityIndicator color={brand.text} />
                </View>
              ) : null}

              {ENABLE_GOOGLE ? (
                <OAuthButton
                  label={t('continueWithGoogle')}
                  icon="logo-google"
                  busy={oauthBusy === 'google'}
                  disabled={oauthBusy !== null || busy}
                  onPress={() => onOAuth('google')}
                />
              ) : null}
              {ENABLE_GITHUB ? (
                <OAuthButton
                  label={t('continueWithGithub')}
                  icon="logo-github"
                  busy={oauthBusy === 'github'}
                  disabled={oauthBusy !== null || busy}
                  onPress={() => onOAuth('github')}
                />
              ) : null}

              {anySocial ? (
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('orWithEmail')}</Text>
                  <View style={styles.dividerLine} />
                </View>
              ) : null}

              <TextInput
                style={[styles.input, inputFocused && styles.inputFocused]}
                placeholder="you@example.com"
                placeholderTextColor={brand.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                editable={!busy && oauthBusy === null}
              />

              {error ? (
                <Animated.View
                  style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] }}
                >
                  <Text style={styles.error}>{error}</Text>
                </Animated.View>
              ) : null}

              <PrimaryButton
                label={t('emailMeCode')}
                onPress={onContinue}
                disabled={!emailValid || busy || oauthBusy !== null}
                busy={busy}
              />
            </>
          ) : step === 'code' ? (
            <>
              <Text style={styles.title}>{t('enterCode')}</Text>
              <Text style={styles.subtitle}>{t('weEmailedCode').replace('{email}', email)}</Text>

              <TextInput
                style={[styles.input, styles.codeInput, inputFocused && styles.inputFocused]}
                placeholder={t('enterCode')}
                placeholderTextColor={brand.textFaint}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={8}
                value={code}
                onChangeText={setCode}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                editable={!busy}
              />

              {error ? (
                <Animated.View
                  style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] }}
                >
                  <Text style={styles.error}>{error}</Text>
                </Animated.View>
              ) : null}

              <PrimaryButton
                label={t('verifyContinue')}
                onPress={onVerify}
                disabled={code.trim().length < 6 || busy}
                busy={busy}
              />

              <Pressable
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
                disabled={busy}
                hitSlop={8}
              >
                <Text style={styles.link}>{t('useDifferentEmail')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>{t('reviewerSignIn')}</Text>
              <Text style={styles.subtitle}>{t('enterPasswordFor').replace('{email}', email)}</Text>

              <TextInput
                style={[styles.input, inputFocused && styles.inputFocused]}
                placeholder={t('password')}
                placeholderTextColor={brand.textFaint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                editable={!busy}
              />

              {error ? (
                <Animated.View
                  style={{ transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] }}
                >
                  <Text style={styles.error}>{error}</Text>
                </Animated.View>
              ) : null}

              <PrimaryButton
                label={t('signIn')}
                onPress={onPasswordSignIn}
                disabled={password.length < 6 || busy}
                busy={busy}
              />

              <Pressable
                onPress={() => {
                  setStep('email');
                  setPassword('');
                  setError(null);
                }}
                disabled={busy}
                hitSlop={8}
              >
                <Text style={styles.link}>{t('useDifferentEmail')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={brand.onAccent} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function OAuthButton({
  label,
  icon,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.oauthBtn,
        disabled && !busy && styles.buttonDisabled,
        pressed && styles.oauthBtnPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={brand.text} />
      ) : (
        <>
          <Ionicons name={icon} size={18} color={brand.text} />
          <Text style={styles.oauthText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xl },
  logoImg: { width: 26, height: 26, borderRadius: 7 },
  wordmark: { color: brand.text, fontSize: 20, fontFamily: font.display, letterSpacing: -0.3 },
  oauthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    minHeight: 50,
  },
  oauthBtnPressed: { backgroundColor: brand.surfaceAlt, transform: [{ scale: 0.97 }] },
  appleBtn: { height: 50, width: '100%' },
  oauthText: { color: brand.text, fontSize: 15, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: space.xs },
  dividerLine: { flex: 1, height: 1, backgroundColor: brand.border },
  dividerText: { color: brand.textFaint, fontSize: 12 },
  title: { color: brand.text, fontSize: 28, fontFamily: font.display, letterSpacing: -0.5 },
  subtitle: { color: brand.textMuted, fontSize: 15, lineHeight: 21, marginBottom: space.md },
  input: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    color: brand.text,
    fontSize: 16,
  },
  inputFocused: { borderColor: brand.accent },
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center', fontWeight: '600' },
  error: { color: brand.danger, fontSize: 14 },
  button: {
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
    minHeight: 50,
  },
  buttonPressed: { backgroundColor: brand.accentDim, transform: [{ scale: 0.95 }] },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: brand.onAccent, fontSize: 16, fontWeight: '700' },
  link: { color: brand.accent, fontSize: 14, textAlign: 'center', marginTop: space.lg },
});
