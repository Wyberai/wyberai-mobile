import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { askSupport } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// Mirrors web's Wyberman help chat: a free assistant that answers questions
// about WyberAi (plans, credits, publishing, domains, troubleshooting) from the
// same /api/support endpoint. It never edits your project.

type Msg = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'How do credits work?',
  'How do I publish my app?',
  'How do I connect my own domain?',
  'My preview looks blank, what should I do?',
];

// Replies come back as light markdown; show the common cases cleanly.
const clean = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^#{1,3}\s+/gm, '');

export default function HelpScreen() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const handle = useRef<{ abort: () => void } | null>(null);
  const list = useRef<FlatList<Msg>>(null);

  useEffect(() => () => handle.current?.abort(), []);

  function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    tap();
    const visible: Msg[] = [...messages, { role: 'user', content: q }];
    setMessages([...visible, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    const setLast = (content: string) =>
      setMessages((m) => (m.length ? [...m.slice(0, -1), { role: 'assistant', content }] : m));
    handle.current = askSupport(visible, {
      onText: setLast,
      onDone: () => setBusy(false),
      onError: (msg) => {
        setLast(msg);
        setBusy(false);
      },
    });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: 'Ask Wyberman', headerBackTitle: 'Back' }} />
      {messages.length === 0 ? (
        <View style={styles.intro}>
          <Ionicons name="help-buoy-outline" size={40} color={brand.accent} />
          <Text style={styles.title}>How can I help?</Text>
          <Text style={styles.body}>Ask about plans, credits, publishing, domains or anything that looks off. It costs nothing.</Text>
          {STARTERS.map((s) => (
            <Pressable key={s} style={styles.chip} onPress={() => send(s)}>
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <FlatList
          ref={list}
          style={styles.flex}
          contentContainerStyle={styles.list}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.user : styles.bot]}>
              <Text style={item.role === 'user' ? styles.userText : styles.botText}>
                {clean(item.content) || '…'}
              </Text>
            </View>
          )}
        />
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask a question"
          placeholderTextColor={brand.textFaint}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          editable={!busy}
          multiline
        />
        <Pressable style={[styles.send, (busy || !input.trim()) && styles.dim]} onPress={() => send(input)} disabled={busy || !input.trim()}>
          <Ionicons name="arrow-up" size={20} color={brand.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  intro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  title: { color: brand.text, fontSize: 18, fontWeight: '700' },
  body: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  chip: { borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: space.lg },
  chipText: { color: brand.text, fontSize: 13.5 },
  list: { padding: space.lg, gap: space.sm },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: space.md },
  user: { alignSelf: 'flex-end', backgroundColor: brand.accent },
  bot: { alignSelf: 'flex-start', backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border },
  userText: { color: brand.onAccent, fontSize: 14.5, lineHeight: 20 },
  botText: { color: brand.text, fontSize: 14.5, lineHeight: 21 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: brand.border, backgroundColor: brand.surface },
  input: { flex: 1, maxHeight: 120, backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2, color: brand.text, fontSize: 14.5 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: brand.accent, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
});
