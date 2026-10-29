import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder screen that proves the toolchain works. The real GoodNeighbour screens replace it next.
// It makes no network calls. Colours come from the approved prototype palette.
export default function App() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        GoodNeighbour
      </Text>
      <Text style={styles.tagline}>Small acts. Real change.</Text>
      <Text style={styles.note}>Native app foundation. Screens are coming next.</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#00706E',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  tagline: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  note: {
    color: '#E6F7F6',
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
  },
});
