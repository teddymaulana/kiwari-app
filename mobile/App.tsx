import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import type { Guard, Shift, SyncData } from "./src/api";
import {
  discardItem,
  enqueue,
  flushQueue,
  loadCache,
  loadQueue,
  refreshCache,
  shiftCandidates,
  type QueueItem,
} from "./src/store";

// Guards share phones, so who's logged in is never persisted: the session
// lives only in this component's state, and every submission — or
// "Keluar" — drops back to the login screen for the next guard. Login and
// shift choice work offline from the cached guard list/schedule (see
// src/store.ts); submissions go into a queue that's sent whenever there's
// a connection.
type Screen = "home" | "absen" | "patroli";
type Session = { guard: Guard; pin: string; shifts: Shift[] };
type Draft = { photoUri?: string; report?: string; captured_at: string };

// How often to retry the queue while the app is open.
const FLUSH_INTERVAL_MS = 60_000;

const SHIFT_LABELS = { pagi: "Pagi (07.00–19.00)", malam: "Malam (19.00–07.00)" };

function formatDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export default function App() {
  const [cache, setCache] = useState<SyncData | null>(loadCache);
  const [queue, setQueue] = useState<QueueItem[]>(loadQueue);
  const [syncing, setSyncing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [shift, setShift] = useState<Shift | null>(null);

  // Send whatever's queued, then pull fresh guards/shifts. Both fail
  // quietly when offline — the cached data and the queue just stay.
  const sync = useCallback(async () => {
    setSyncing(true);
    await flushQueue();
    setQueue(loadQueue());
    const fresh = await refreshCache();
    if (fresh) setCache(fresh);
    setSyncing(false);
  }, []);

  useEffect(() => {
    sync();
    const timer = setInterval(() => {
      if (loadQueue().some((q) => !q.error)) sync();
    }, FLUSH_INTERVAL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [sync]);

  const logout = () => {
    setSession(null);
    setShift(null);
    setScreen("home");
  };

  const submit = async (kind: "checkin" | "patroli", draft: Draft) => {
    if (!session || !shift) return false;
    // The server takes one absen/patroli per guard per shift, so a second
    // one still waiting on the phone would only be dropped later.
    const pending = loadQueue().find(
      (q) =>
        !q.error &&
        q.kind === kind &&
        q.guard_id === session.guard.id &&
        q.shift_date === shift.shift_date &&
        q.shift_type === shift.shift_type
    );
    if (pending) {
      Alert.alert(
        "Sudah tersimpan",
        kind === "checkin"
          ? "Absen Anda untuk shift ini sudah tersimpan di HP dan menunggu dikirim."
          : "Laporan patroli Anda untuk shift ini sudah tersimpan di HP dan menunggu dikirim."
      );
      return false;
    }
    let item: QueueItem;
    try {
      item = await enqueue({
        kind,
        guard_id: session.guard.id,
        guard_name: session.guard.name,
        pin: session.pin,
        ...shift,
        ...draft,
      });
    } catch (e) {
      // Couldn't even save it on the phone (e.g. storage full) — stay on
      // the form so nothing typed is lost.
      Alert.alert("Gagal menyimpan", (e as Error).message);
      return false;
    }
    const duplicates = await flushQueue();
    const left = loadQueue();
    setQueue(left);
    const queued = left.find((q) => q.id === item.id);
    if (duplicates.includes(item.id)) {
      Alert.alert(
        "Sudah pernah dikirim",
        kind === "checkin"
          ? "Sudah pernah absen untuk shift ini."
          : "Sudah pernah lapor patroli untuk shift ini. Hubungi pengurus jika ada tambahan."
      );
    } else if (!queued) {
      Alert.alert(
        "Terkirim",
        kind === "checkin" ? "Absen Anda sudah terkirim." : "Laporan patroli sudah terkirim."
      );
    } else if (queued.error) {
      Alert.alert("Ditolak", queued.error);
    } else {
      Alert.alert(
        "Tersimpan di HP",
        "Belum ada internet. Data akan dikirim otomatis saat ada sinyal — jangan hapus aplikasi."
      );
    }
    logout();
    return true;
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {!session ? (
        <LoginScreen
          cache={cache}
          queue={queue}
          syncing={syncing}
          onSync={sync}
          onDiscard={(item) => {
            discardItem(item);
            setQueue(loadQueue());
          }}
          onLogin={(guard, pin) => {
            const shifts = cache ? shiftCandidates(cache, guard.id) : [];
            setSession({ guard, pin, shifts });
            setShift(shifts[0] ?? null);
          }}
        />
      ) : screen === "home" || !shift ? (
        <HomeScreen
          session={session}
          shift={shift}
          onShift={setShift}
          onOpen={setScreen}
          onLogout={logout}
        />
      ) : screen === "absen" ? (
        <AbsenScreen
          shift={shift}
          onBack={() => setScreen("home")}
          onSubmit={(draft) => submit("checkin", draft)}
        />
      ) : (
        <PatroliScreen
          shift={shift}
          onBack={() => setScreen("home")}
          onSubmit={(draft) => submit("patroli", draft)}
        />
      )}
    </View>
  );
}

function LoginScreen({
  cache,
  queue,
  syncing,
  onSync,
  onDiscard,
  onLogin,
}: {
  cache: SyncData | null;
  queue: QueueItem[];
  syncing: boolean;
  onSync: () => void;
  onDiscard: (item: QueueItem) => void;
  onLogin: (guard: Guard, pin: string) => void;
}) {
  const [guardId, setGuardId] = useState("");
  const [pin, setPin] = useState("");

  // Checked against the cached list so it works with no signal; the
  // server checks the PIN again when the submission arrives.
  const submit = () => {
    const guard = cache?.guards.find((g) => g.id === guardId);
    if (!guard || guard.pin !== pin.trim()) {
      Alert.alert("Gagal masuk", "Nama atau PIN salah");
      setPin("");
      return;
    }
    onLogin(guard, guard.pin);
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Security Kiwari</Text>
      <Text style={styles.muted}>Pilih nama Anda, lalu masukkan PIN.</Text>

      <QueuePanel queue={queue} syncing={syncing} onSync={onSync} onDiscard={onDiscard} />

      {!cache ? (
        syncing ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : (
          <>
            <Text style={styles.error}>
              Data petugas belum terunduh. Sambungkan HP ke internet sekali, lalu coba lagi.
            </Text>
            <Button label="Coba lagi" onPress={onSync} />
          </>
        )
      ) : (
        <>
          <Text style={styles.label}>Nama</Text>
          {cache.guards.map((g) => (
            <Option
              key={g.id}
              label={g.name}
              selected={g.id === guardId}
              onPress={() => setGuardId(g.id)}
            />
          ))}

          <Text style={styles.label}>PIN</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            placeholder="PIN"
          />

          <Button label="Masuk" onPress={submit} disabled={!guardId || !pin} />
        </>
      )}
    </ScrollView>
  );
}

// Shows what's still on the phone: items waiting for signal, and any the
// server rejected (with its reason) so they can be noted and removed.
function QueuePanel({
  queue,
  syncing,
  onSync,
  onDiscard,
}: {
  queue: QueueItem[];
  syncing: boolean;
  onSync: () => void;
  onDiscard: (item: QueueItem) => void;
}) {
  if (queue.length === 0) return null;
  const waiting = queue.filter((q) => !q.error).length;
  const rejected = queue.filter((q) => q.error);

  return (
    <View style={styles.panel}>
      {waiting > 0 && (
        <>
          <Text style={styles.panelText}>{waiting} data menunggu dikirim (belum ada internet).</Text>
          <Button label="Kirim sekarang" variant="secondary" onPress={onSync} busy={syncing} />
        </>
      )}
      {rejected.map((item) => (
        <View key={item.id} style={{ marginTop: 12 }}>
          <Text style={styles.panelText}>
            Ditolak: {item.kind === "checkin" ? "Absen" : "Patroli"} {item.guard_name},{" "}
            {SHIFT_LABELS[item.shift_type]} {formatDate(item.shift_date)} — {item.error}
          </Text>
          <Button
            label="Hapus"
            variant="secondary"
            onPress={() =>
              Alert.alert("Hapus data ini?", "Data yang dihapus tidak bisa dikembalikan.", [
                { text: "Batal", style: "cancel" },
                { text: "Hapus", style: "destructive", onPress: () => onDiscard(item) },
              ])
            }
          />
        </View>
      ))}
    </View>
  );
}

function HomeScreen({
  session,
  shift,
  onShift,
  onOpen,
  onLogout,
}: {
  session: Session;
  shift: Shift | null;
  onShift: (s: Shift) => void;
  onOpen: (s: Screen) => void;
  onLogout: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Halo, {session.guard.name}</Text>

      {session.shifts.length === 0 ? (
        <Text style={styles.error}>
          Tidak ada jadwal shift Anda hari ini atau kemarin malam. Hubungi pengurus jika ini
          seharusnya jadwal Anda.
        </Text>
      ) : (
        <>
          <Text style={styles.label}>Shift</Text>
          {session.shifts.map((s) => (
            <Option
              key={s.shift_date + s.shift_type}
              label={`${SHIFT_LABELS[s.shift_type]} — ${formatDate(s.shift_date)}`}
              selected={s === shift}
              onPress={() => onShift(s)}
            />
          ))}
          <View style={{ height: 16 }} />
          <Button label="Absen Kehadiran" big onPress={() => onOpen("absen")} disabled={!shift} />
          <Button label="Laporan Patroli" big onPress={() => onOpen("patroli")} disabled={!shift} />
        </>
      )}

      <Button label="Keluar" variant="secondary" onPress={onLogout} />
    </ScrollView>
  );
}

type Photo = { uri: string; captured_at: string };

async function takePhoto(): Promise<Photo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Izin kamera", "Izinkan akses kamera untuk mengambil foto.");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  if (result.canceled) return null;
  return { uri: result.assets[0].uri, captured_at: new Date().toISOString() };
}

function PhotoField({ photo, onChange }: { photo: Photo | null; onChange: (p: Photo) => void }) {
  return (
    <>
      {photo && <Image source={{ uri: photo.uri }} style={styles.photo} />}
      <Button
        label={photo ? "Ambil ulang foto" : "Ambil foto"}
        variant="secondary"
        onPress={async () => {
          const taken = await takePhoto();
          if (taken) onChange(taken);
        }}
      />
    </>
  );
}

function ShiftHeader({ title, shift, onBack }: { title: string; shift: Shift; onBack: () => void }) {
  return (
    <>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={styles.back}>‹ Kembali</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.muted}>
        Shift {SHIFT_LABELS[shift.shift_type]} — {formatDate(shift.shift_date)}
      </Text>
    </>
  );
}

function AbsenScreen({
  shift,
  onBack,
  onSubmit,
}: {
  shift: Shift;
  onBack: () => void;
  onSubmit: (draft: Draft) => Promise<boolean>;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!photo) return;
    setBusy(true);
    if (!(await onSubmit({ photoUri: photo.uri, captured_at: photo.captured_at }))) setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ShiftHeader title="Absen Kehadiran" shift={shift} onBack={onBack} />
      <Text style={styles.label}>Foto</Text>
      <PhotoField photo={photo} onChange={setPhoto} />
      <Button label="Kirim Absen" big onPress={submit} busy={busy} disabled={!photo} />
    </ScrollView>
  );
}

function PatroliScreen({
  shift,
  onBack,
  onSubmit,
}: {
  shift: Shift;
  onBack: () => void;
  onSubmit: (draft: Draft) => Promise<boolean>;
}) {
  const [report, setReport] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);

  // With no photo, "captured" is when the guard pressed Kirim.
  const submit = async () => {
    setBusy(true);
    const ok = await onSubmit({
      report: report.trim(),
      photoUri: photo?.uri,
      captured_at: photo?.captured_at ?? new Date().toISOString(),
    });
    if (!ok) setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ShiftHeader title="Laporan Patroli" shift={shift} onBack={onBack} />
      <Text style={styles.label}>Laporan</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={report}
        onChangeText={setReport}
        multiline
        placeholder="Contoh: Keliling blok A–D, semua aman. Lampu jalan blok C mati."
      />
      <Text style={styles.label}>Foto (opsional)</Text>
      <PhotoField photo={photo} onChange={setPhoto} />
      <Button label="Kirim Laporan" big onPress={submit} busy={busy} disabled={!report.trim()} />
    </ScrollView>
  );
}

function Option({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.option, selected && styles.optionSelected]}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function Button({
  label,
  onPress,
  busy,
  disabled,
  big,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  big?: boolean;
  variant?: "primary" | "secondary";
}) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={[
        styles.button,
        big && styles.buttonBig,
        variant === "secondary" && styles.buttonSecondary,
        off && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.buttonText, variant === "secondary" && styles.buttonTextSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f9fafb" },
  page: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "600", color: "#111827", marginBottom: 4 },
  muted: { fontSize: 14, color: "#6b7280", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "500", color: "#374151", marginTop: 16, marginBottom: 6 },
  error: { fontSize: 14, color: "#b91c1c", marginTop: 16 },
  panel: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  panelText: { fontSize: 14, color: "#92400e" },
  back: { fontSize: 16, color: "#2563eb", marginBottom: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  textarea: { minHeight: 120, textAlignVertical: "top" },
  option: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  optionSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  optionText: { fontSize: 16, color: "#111827" },
  optionTextSelected: { color: "#1d4ed8", fontWeight: "600" },
  photo: { width: "100%", aspectRatio: 3 / 4, borderRadius: 8, marginBottom: 8 },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonBig: { paddingVertical: 18 },
  buttonSecondary: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonTextSecondary: { color: "#374151" },
});
