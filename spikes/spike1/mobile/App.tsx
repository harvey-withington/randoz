// Spike screen: start the P2P core in a Bare worklet, join or create a group,
// share a test item, and show the worklet's log. No polish on purpose.

import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Paths } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import { useKeepAwake } from 'expo-keep-awake';
import worker from 'expo-bare-kit/workers/worker';
import b4a from 'b4a';

type Command =
  | { cmd: 'start'; storage: string; bootstrap: { host: string; port: number }; secret: string; create: boolean }
  | { cmd: 'share'; mb: number };

type Ipc = Awaited<ReturnType<typeof worker.start>>['ipc'];

// The two test networks: our own DHT on the home PC, and Holepunch's public one.
const PRESETS = {
  home: { bootstrap: '192.168.1.112:49737', secret: 'demo' },
  public: { bootstrap: '88.99.3.86:49737', secret: 'rz7391' },
};

export default function App() {
  const ipc = useRef<Ipc | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [bootstrap, setBootstrap] = useState('192.168.1.112:49737');
  const [secret, setSecret] = useState('demo');
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState(false);

  // A sleeping screen would pause the app and drop its connections mid-test.
  useKeepAwake();

  const usePreset = (preset: keyof typeof PRESETS) => {
    setBootstrap(PRESETS[preset].bootstrap);
    setSecret(PRESETS[preset].secret);
  };

  const copyLog = async () => {
    await Clipboard.setStringAsync(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const addLine = (text: string) => {
    const time = new Date().toISOString().slice(11, 23);
    setLines((prev) => [...prev, `${time} ${text}`]);
  };

  useEffect(() => {
    let pending = '';
    worker
      .start()
      .then(({ ipc: stream }) => {
        ipc.current = stream;
        // One JSON message per line; the stream may split or join them.
        stream.on('data', (data) => {
          pending += b4a.toString(data as Uint8Array);
          let end: number;
          while ((end = pending.indexOf('\n')) !== -1) {
            const msg = JSON.parse(pending.slice(0, end));
            pending = pending.slice(end + 1);
            if (msg.event === 'log') addLine(msg.text);
          }
        });
      })
      .catch((err: Error) => addLine('worklet failed to start: ' + err.message));
  }, []);

  const send = (command: Command) => {
    if (!ipc.current) return addLine('worklet not running');
    ipc.current.write(b4a.from(JSON.stringify(command) + '\n'));
  };

  const start = (create: boolean) => {
    const [host, port] = bootstrap.trim().split(':');
    const storage = decodeURI(Paths.document.uri).replace(/^file:\/\//, '');
    send({ cmd: 'start', storage, bootstrap: { host, port: Number(port) }, secret, create });
    setStarted(true);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <Text style={styles.title}>RANDOZ spike 1</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Bootstrap</Text>
        <TextInput style={styles.input} value={bootstrap} onChangeText={setBootstrap} autoCapitalize="none" editable={!started} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Secret</Text>
        <TextInput style={styles.input} value={secret} onChangeText={setSecret} autoCapitalize="none" editable={!started} />
      </View>
      <View style={styles.row}>
        <Button title="Home DHT" onPress={() => usePreset('home')} disabled={started} />
        <Button title="Public DHT" onPress={() => usePreset('public')} disabled={started} />
        <Button title={copied ? 'Copied' : 'Copy log'} onPress={copyLog} />
      </View>
      <View style={styles.row}>
        <Button title="Join group" onPress={() => start(false)} disabled={started} />
        <Button title="Create group" onPress={() => start(true)} disabled={started} />
        <Button title="Share 5 MB" onPress={() => send({ cmd: 'share', mb: 5 })} disabled={!started} />
      </View>
      <ScrollView ref={scroll} style={styles.log} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
        {lines.map((line, index) => (
          <Text key={index} style={styles.line} selectable>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 48, paddingHorizontal: 12, paddingBottom: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { width: 76 },
  input: { flex: 1, borderWidth: 1, borderColor: '#999', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  log: { flex: 1, backgroundColor: '#111', borderRadius: 4, padding: 8 },
  line: { color: '#ddd', fontFamily: 'monospace', fontSize: 11 },
});
