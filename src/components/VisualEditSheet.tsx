import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, font, radius, space } from '@/lib/theme';
import { tap } from '@/lib/haptics';
import type { StepFamily } from '@/lib/visual-edit-apply';
import type { SelectedElementInfo } from '@/components/PreviewRevealSheet';

// The Visual Edits panel — shown after tapping an element in the live
// preview (select mode). Text and style-token changes here are FREE (write
// straight to source, see lib/visual-edit-apply.ts); "Ask AI" is the paid
// fallback for anything that isn't a simple text/token change.

const STEPPERS: { family: StepFamily; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { family: 'text-size', label: 'Text size', icon: 'text-outline' },
  { family: 'p', label: 'Padding', icon: 'resize-outline' },
  { family: 'gap', label: 'Gap', icon: 'reorder-two-outline' },
  { family: 'rounded', label: 'Corners', icon: 'square-outline' },
];

const COLOR_SWATCHES: { token: string; hex: string }[] = [
  { token: 'foreground', hex: '#EEEEF4' },
  { token: 'muted-foreground', hex: '#7878A0' },
  { token: 'primary', hex: '#0EA5E9' },
  { token: 'destructive', hex: '#EF4444' },
  { token: 'background', hex: '#0C0C10' },
  { token: 'card', hex: '#18181F' },
];

export function VisualEditSheet({
  visible,
  element,
  onClose,
  onApplyText,
  onStep,
  onSetColor,
  onAskAI,
}: {
  visible: boolean;
  element: SelectedElementInfo | null;
  onClose: () => void;
  onApplyText: (newText: string) => void;
  onStep: (family: StepFamily, dir: 1 | -1) => void;
  onSetColor: (prop: 'text' | 'bg', token: string) => void;
  onAskAI: (instruction: string) => void;
}) {
  const [textDraft, setTextDraft] = useState('');
  const [aiInstruction, setAiInstruction] = useState('');
  const [colorProp, setColorProp] = useState<'text' | 'bg'>('text');

  useEffect(() => {
    // Reset the draft for a freshly-tapped element — legitimate prop-driven
    // reset, not a derivation the compiler's generic check can see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTextDraft(element?.text ?? '');
    setAiInstruction('');
  }, [element?.selector, element?.text]);

  if (!visible || !element) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{`<${element.tag}>`}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={brand.textMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {element.text ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Text</Text>
                <TextInput
                  style={styles.textInput}
                  value={textDraft}
                  onChangeText={setTextDraft}
                  multiline
                  placeholderTextColor={brand.textFaint}
                />
                <Pressable
                  style={[styles.applyBtn, textDraft.trim() === element.text.trim() && styles.applyBtnDisabled]}
                  disabled={textDraft.trim() === element.text.trim()}
                  onPress={() => { tap(); onApplyText(textDraft); }}
                >
                  <Text style={styles.applyBtnText}>Apply — free</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Style</Text>
              <View style={styles.stepperGrid}>
                {STEPPERS.map((s) => (
                  <View key={s.family} style={styles.stepperRow}>
                    <Ionicons name={s.icon} size={14} color={brand.textMuted} />
                    <Text style={styles.stepperLabel}>{s.label}</Text>
                    <View style={styles.stepperBtns}>
                      <Pressable style={styles.stepperBtn} onPress={() => { tap(); onStep(s.family, -1); }}>
                        <Ionicons name="remove" size={16} color={brand.text} />
                      </Pressable>
                      <Pressable style={styles.stepperBtn} onPress={() => { tap(); onStep(s.family, 1); }}>
                        <Ionicons name="add" size={16} color={brand.text} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.colorPropRow}>
                <Text style={styles.sectionLabel}>Color</Text>
                <View style={styles.colorPropToggle}>
                  <Pressable
                    style={[styles.colorPropBtn, colorProp === 'text' && styles.colorPropBtnActive]}
                    onPress={() => setColorProp('text')}
                  >
                    <Text style={[styles.colorPropText, colorProp === 'text' && styles.colorPropTextActive]}>Text</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.colorPropBtn, colorProp === 'bg' && styles.colorPropBtnActive]}
                    onPress={() => setColorProp('bg')}
                  >
                    <Text style={[styles.colorPropText, colorProp === 'bg' && styles.colorPropTextActive]}>Background</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.swatchRow}>
                {COLOR_SWATCHES.map((c) => (
                  <Pressable
                    key={c.token}
                    style={[styles.swatch, { backgroundColor: c.hex }]}
                    onPress={() => { tap(); onSetColor(colorProp, c.token); }}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Something else? Ask AI</Text>
              <View style={styles.aiRow}>
                <TextInput
                  style={styles.aiInput}
                  placeholder="e.g. make this a link to /pricing"
                  placeholderTextColor={brand.textFaint}
                  value={aiInstruction}
                  onChangeText={setAiInstruction}
                />
                <Pressable
                  style={[styles.aiSendBtn, !aiInstruction.trim() && styles.applyBtnDisabled]}
                  disabled={!aiInstruction.trim()}
                  onPress={() => { tap(); onAskAI(aiInstruction.trim()); setAiInstruction(''); }}
                >
                  <Ionicons name="sparkles" size={16} color={brand.onAccent} />
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,10,0.62)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: brand.bg,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    borderTopWidth: 1,
    borderColor: brand.border,
    paddingBottom: space.lg,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: brand.border, marginTop: space.sm },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },
  title: { color: brand.text, fontSize: 15, fontFamily: font.display },
  content: { padding: space.lg, gap: space.lg },
  section: { gap: space.sm },
  sectionLabel: { color: brand.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  textInput: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    padding: space.md,
    color: brand.text,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  applyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: brand.accent,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  applyBtnDisabled: { opacity: 0.4 },
  applyBtnText: { color: brand.onAccent, fontSize: 12.5, fontWeight: '700' },
  stepperGrid: { gap: space.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperLabel: { flex: 1, color: brand.text, fontSize: 13, fontWeight: '600' },
  stepperBtns: { flexDirection: 'row', gap: 6 },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPropRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  colorPropToggle: { flexDirection: 'row', gap: 4, backgroundColor: brand.surfaceAlt, borderRadius: radius.pill, padding: 2 },
  colorPropBtn: { paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.pill },
  colorPropBtnActive: { backgroundColor: brand.accent },
  colorPropText: { color: brand.textMuted, fontSize: 11, fontWeight: '600' },
  colorPropTextActive: { color: brand.onAccent },
  swatchRow: { flexDirection: 'row', gap: space.sm },
  swatch: { width: 32, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: brand.border },
  aiRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  aiInput: {
    flex: 1,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 13.5,
  },
  aiSendBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
