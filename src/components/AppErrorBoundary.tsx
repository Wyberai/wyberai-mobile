import { Component, type ReactNode } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import { brand, font, radius, space } from '@/lib/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
  }

  handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Updates.reloadAsync is unavailable in dev / Expo Go — reset local state
      // so at least the current session can try rendering again.
      this.setState({ hasError: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Image source={require('../../assets/images/icon.png')} style={styles.icon} />
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          WyberAi hit an unexpected error. Restarting usually clears it up.
        </Text>
        <Pressable style={styles.button} onPress={this.handleRestart}>
          <Text style={styles.buttonText}>Restart</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    marginBottom: space.xl,
  },
  title: {
    fontFamily: font.display,
    fontSize: 20,
    color: brand.text,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: brand.textMuted,
    textAlign: 'center',
    marginBottom: space.xl,
    lineHeight: 20,
  },
  button: {
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
  },
  buttonText: {
    fontFamily: font.displayMedium,
    color: brand.onAccent,
    fontSize: 15,
  },
});
