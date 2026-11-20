import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as Network from "expo-network";
import type { CheckinType, Guard, SecurityAlert, Shift, SyncData } from "./src/api";
import { ackAlert, fetchAlerts, OfflineError } from "./src/api";
import { onAlertPush, setUpPush } from "./src/push";
import {
  discardItem,
  enqueue,
  flushQueue,
  loadCache,
  loadQueue,
  refreshCache,
  checkinStatus,
  shiftPatrols,
  type PatrolEntry,
  type Status,
  currentShift,
  type QueueItem,
} from "./src/store";

// Guards share phones, so who's logged in is never persisted: the session
// lives only in this component's state, and every submission — or
// "Keluar" — drops back to the login screen for the next guard. Login and
// the current shift work offline from the cached guard list/schedule (see
// src/store.ts); submissions go into a queue that's sent whenever there's
// a connection.
// Absen twice per shift (masuk at the start, pulang at the end); patroli
// as many times as needed.
type Screen = "home" | "absen-masuk" | "absen-pulang" | "patroli";
type Session = { guard: Guard; pin: string; shift: Shift | null };
type Draft = { photoUri?: string; report?: string; captured_at: string };

// How often to retry the queue while the app is open.
const FLUSH_INTERVAL_MS = 60_000;
// How often to check for new Alert Sekuriti while the app is open. A
// push notification (src/push.ts) also triggers an immediate check, and
// is what reaches the phone while the app is closed.
const ALERT_POLL_MS = 15_000;
// Long buzz, pause — repeated until the alert is handled or closed.
const ALERT_VIBRATION = [0, 1000, 600];

const LOGO = require("./assets/kiwari-logo.png");

const SHIFT_LABELS = { pagi: "Pagi (07.00–19.00)", malam: "Malam (19.00–07.00)" };

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
}

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
  const shift = session?.shift ?? null;
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  // Open alerts a guard closed the full-screen view of without taking them
  // (e.g. nobody logged in yet) — they stay listed, just stop buzzing.
  const [silenced, setSilenced] = useState<string[]>([]);

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await fetchAlerts());
    } catch {
      // Offline or server hiccup — keep what we have, try again next tick.
    }
  }, []);

  useEffect(() => {
    setUpPush();
    return onAlertPush(loadAlerts);
  }, [loadAlerts]);

  useEffect(() => {
    loadAlerts();
    let timer = setInterval(loadAlerts, ALERT_POLL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      clearInterval(timer);
      if (state === "active") {
        loadAlerts();
        timer = setInterval(loadAlerts, ALERT_POLL_MS);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [loadAlerts]);

  const ringing = alerts.find((a) => a.status === "open" && !silenced.includes(a.id)) ?? null;

  useEffect(() => {
    if (!ringing) return;
    Vibration.vibrate(ALERT_VIBRATION, true);
    return () => Vibration.cancel();
  }, [ringing?.id]);

  const takeAlert = async (alert: SecurityAlert) => {
    if (!session) return;
    try {
      const already = await ackAlert(alert.id, session.guard.id, session.pin);
      if (already) Alert.alert("Sudah ditangani", `Alert ini sudah diambil ${already}.`);
    } catch (e) {
      Alert.alert(
        "Gagal",
        e instanceof OfflineError ? "Tidak ada koneksi internet. Coba lagi." : (e as Error).message
      );
      return;
    }
    setSilenced((s) => [...s, alert.id]);
    loadAlerts();
  };

  // Send whatever's queued, then pull fresh guards/shifts. Both fail
  // quietly when offline — the cached data and the queue just stay.
  const sync = useCallback(async () => {
    setSyncing(true);
    await flushQueue();
    setQueue(loadQueue());
    setCache(loadCache());
    const fresh = await refreshCache();
    if (fresh) setCache(fresh);
    setSyncing(false);
  }, []);

  // Sends on open, when the app comes back to the foreground, the moment
  // the phone gets a connection, and every minute as a fallback (signal
  // that's "connected" but too weak to get through).
  useEffect(() => {
    sync();
    const hasWaiting = () => loadQueue().some((q) => !q.error);
    const timer = setInterval(() => {
      if (hasWaiting()) sync();
    }, FLUSH_INTERVAL_MS);
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    const netSub = Network.addNetworkStateListener(({ isConnected, isInternetReachable }) => {
      if (isConnected && isInternetReachable !== false && hasWaiting()) sync();
    });
    return () => {
      clearInterval(timer);
      appSub.remove();
      netSub.remove();
    };
  }, [sync]);

  const logout = () => {
    setSession(null);
    setScreen("home");
  };

  const submit = async (kind: "checkin" | "patroli", draft: Draft, checkinType?: CheckinType) => {
    if (!session || !shift) return false;
    const absenLabel = checkinType === "pulang" ? "Absen pulang" : "Absen masuk";
    // The server takes one absen masuk and one pulang per guard per shift,
    // so a second one still waiting on the phone would only be dropped
    // later. Patrols have no limit.
    const pending =
      kind === "checkin" &&
      loadQueue().find(
        (q) =>
          !q.error &&
          q.kind === "checkin" &&
          (q.checkin_type ?? "masuk") === checkinType &&
          q.guard_id === session.guard.id &&
          q.shift_date === shift.shift_date &&
          q.shift_type === shift.shift_type
      );
    if (pending) {
      Alert.alert(
        "Sudah tersimpan",
        `${absenLabel} Anda untuk shift ini sudah tersimpan di HP dan menunggu dikirim.`
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
        ...(kind === "checkin" ? { checkin_type: checkinType } : {}),
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
    setCache(loadCache());
    const queued = left.find((q) => q.id === item.id);
    if (duplicates.includes(item.id)) {
      Alert.alert(
        kind === "checkin" ? "Sudah pernah dikirim" : "Terkirim",
        kind === "checkin"
          ? `${absenLabel} untuk shift ini sudah ada.`
          : "Laporan patroli sudah terkirim."
      );
    } else if (!queued) {
      Alert.alert(
        "Terkirim",
        kind === "checkin" ? `${absenLabel} sudah terkirim.` : "Laporan patroli sudah terkirim."
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
      {ringing && (
        <AlertOverlay
          alert={ringing}
          guardName={session?.guard.name ?? null}
          onTake={() => takeAlert(ringing)}
          onClose={() => setSilenced((s) => [...s, ringing.id])}
        />
      )}
      {!session ? (
        <LoginScreen
          alerts={alerts}
          cache={cache}
          queue={queue}
          syncing={syncing}
          onSync={sync}
          onDiscard={(item) => {
            discardItem(item);
            setQueue(loadQueue());
          }}
          onLogin={(guard, pin) =>
            setSession({ guard, pin, shift: cache ? currentShift(cache, guard.id) : null })
          }
        />
      ) : screen === "home" || !shift ? (
        <HomeScreen
          alerts={alerts}
          onTakeAlert={takeAlert}
          session={session}
          shift={shift}
          masuk={shift && checkinStatus(cache, queue, "masuk", session.guard.id, shift)}
          pulang={shift && checkinStatus(cache, queue, "pulang", session.guard.id, shift)}
          patrols={shift ? shiftPatrols(cache, queue, session.guard.id, shift) : []}
          onOpen={setScreen}
          onLogout={logout}
        />
      ) : screen === "absen-masuk" || screen === "absen-pulang" ? (
        <AbsenScreen
          type={screen === "absen-masuk" ? "masuk" : "pulang"}
          shift={shift}
          onBack={() => setScreen("home")}
          onSubmit={(draft) =>
            submit("checkin", draft, screen === "absen-masuk" ? "masuk" : "pulang")
          }
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

// Step 1: tap your name tile. Step 2: enter your PIN (with a way back in
// case the wrong name was tapped).
function LoginScreen({
  alerts,
  cache,
  queue,
  syncing,
  onSync,
  onDiscard,
  onLogin,
}: {
  alerts: SecurityAlert[];
  cache: SyncData | null;
  queue: QueueItem[];
  syncing: boolean;
  onSync: () => void;
  onDiscard: (item: QueueItem) => void;
  onLogin: (guard: Guard, pin: string) => void;
}) {
  const [guard, setGuard] = useState<Guard | null>(null);

  if (guard) {
    return <PinScreen guard={guard} onBack={() => setGuard(null)} onLogin={onLogin} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.appName}>SECURITY</Text>
      <AlertList alerts={alerts} hint="Masuk dulu untuk menangani alert." />
      <Text style={styles.muted}>Pilih nama Anda.</Text>

      <QueuePanel queue={queue} syncing={syncing} onSync={onSync} onDiscard={onDiscard} />

      {!cache ? (
        syncing ? (
          <ActivityIndicator style={{ marginTop: 24 }} color="#ca8a04" />
        ) : (
          <>
            <Text style={styles.error}>
              Data petugas belum terunduh. Sambungkan HP ke internet sekali, lalu coba lagi.
            </Text>
            <Button label="Coba lagi" onPress={onSync} />
          </>
        )
      ) : (
        <View style={styles.grid}>
          {cache.guards.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => setGuard(g)}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{g.name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.tileName} numberOfLines={2}>
                {g.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// Checked against the cached list so it works with no signal; the server
// checks the PIN again when the submission arrives. Logs in as soon as the
// last digit is typed — the Masuk button can sit under the keyboard
// (Android draws edge-to-edge), so guards shouldn't have to reach it.
function PinScreen({
  guard,
  onBack,
  onLogin,
}: {
  guard: Guard;
  onBack: () => void;
  onLogin: (guard: Guard, pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryLogin = (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Let the spinner paint before the (synchronous) login work runs.
    setTimeout(() => {
      try {
        if (guard.pin !== value.trim()) {
          setError("PIN salah. Coba lagi.");
          setPin("");
          setBusy(false);
          return;
        }
        onLogin(guard, guard.pin);
      } catch (e) {
        setError(`Gagal masuk: ${(e as Error).message}`);
        setBusy(false);
      }
    }, 0);
  };

  const onChange = (v: string) => {
    const digits = v.replace(/\D/g, "");
    setPin(digits);
    if (error) setError(null);
    if (digits.length === guard.pin.length) tryLogin(digits);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} hitSlop={12} disabled={busy}>
          <Text style={styles.back}>‹ Ganti nama</Text>
        </Pressable>
        <View style={styles.pinHeader}>
          <View style={[styles.avatar, styles.avatarBig]}>
            <Text style={[styles.avatarText, styles.avatarTextBig]}>
              {guard.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.title}>{guard.name}</Text>
          <Text style={styles.muted}>Masukkan PIN Anda</Text>
        </View>
        <TextInput
          style={[styles.input, styles.pinInput, error && styles.inputError]}
          value={pin}
          onChangeText={onChange}
          onSubmitEditing={() => tryLogin(pin)}
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          editable={!busy}
          placeholder="••••"
        />
        {error && <Text style={[styles.error, styles.pinError]}>{error}</Text>}
        <Button
          label="Masuk"
          big
          onPress={() => tryLogin(pin)}
          busy={busy}
          disabled={pin.length < 4}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
            Ditolak:{" "}
            {item.kind === "patroli"
              ? "Patroli"
              : item.checkin_type === "pulang"
                ? "Absen pulang"
                : "Absen masuk"}{" "}
            {item.guard_name},{" "}
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
  alerts,
  onTakeAlert,
  session,
  shift,
  masuk,
  pulang,
  patrols,
  onOpen,
  onLogout,
}: {
  alerts: SecurityAlert[];
  onTakeAlert: (alert: SecurityAlert) => Promise<void>;
  session: Session;
  shift: Shift | null;
  masuk: Status;
  pulang: Status;
  patrols: PatrolEntry[];
  onOpen: (s: Screen) => void;
  onLogout: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Image source={LOGO} style={styles.logoSmall} resizeMode="contain" />
      <Text style={styles.title}>Halo, {session.guard.name}</Text>
      <AlertList alerts={alerts} onTake={onTakeAlert} />

      {!shift ? (
        <Text style={styles.error}>
          Anda tidak ada jadwal shift saat ini. Hubungi pengurus jika ini seharusnya jadwal Anda.
        </Text>
      ) : (
        <>
          <View style={styles.shiftCard}>
            <Text style={styles.shiftLabel}>Shift sekarang</Text>
            <Text style={styles.shiftName}>{SHIFT_LABELS[shift.shift_type]}</Text>
            <Text style={styles.muted}>{formatDate(shift.shift_date)}</Text>
          </View>
          <ActionOrStatus
            label="Absen Masuk"
            status={masuk}
            done="Sudah absen masuk"
            waiting="Absen masuk tersimpan di HP"
            rejected="Absen masuk ditolak pengurus. Hubungi pengurus."
            onPress={() => onOpen("absen-masuk")}
          />
          <ActionOrStatus
            label="Absen Pulang"
            status={pulang}
            done="Sudah absen pulang"
            waiting="Absen pulang tersimpan di HP"
            rejected="Absen pulang ditolak pengurus. Hubungi pengurus."
            onPress={() => onOpen("absen-pulang")}
          />
          <Text style={styles.label}>Patroli shift ini ({patrols.length})</Text>
          {patrols.map((p, i) => (
            <Text key={p.id} style={styles.statusDetail}>
              {i + 1}. Pukul {formatTime(p.at)}
              {p.waiting ? " — tersimpan di HP, menunggu internet" : " ✓"}
            </Text>
          ))}
          <Button label="Laporan Patroli" big onPress={() => onOpen("patroli")} />
        </>
      )}

      <Button label="Keluar" variant="secondary" onPress={onLogout} />
    </ScrollView>
  );
}

// One absen masuk and one pulang per shift, so once one is in, its button
// is replaced by what happened to it.
function ActionOrStatus({
  label,
  status,
  done,
  waiting,
  rejected = "Ditolak pengurus. Hubungi pengurus.",
  onPress,
}: {
  label: string;
  status: Status;
  done: string;
  waiting: string;
  rejected?: string;
  onPress: () => void;
}) {
  if (!status) return <Button label={label} big onPress={onPress} />;
  if (status.state === "rejected") {
    return (
      <View style={[styles.status, styles.statusRejected]}>
        <Text style={[styles.statusTitle, styles.statusTitleRejected]}>✕ {rejected}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.status, status.state === "waiting" && styles.statusWaiting]}>
      <Text
        style={[styles.statusTitle, status.state === "waiting" && styles.statusTitleWaiting]}
      >
        ✓ {status.state === "done" ? done : waiting}
      </Text>
      <Text style={styles.statusDetail}>
        {status.state === "done"
          ? `Pukul ${formatTime(status.at)}`
          : "Akan terkirim otomatis saat ada internet"}
      </Text>
    </View>
  );
}

function alertTime(iso: string) {
  const d = new Date(iso);
  return `${formatTime(iso)}, ${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
}

// Full-screen, buzzing until a logged-in guard takes it or someone closes
// it. Closing only silences it on this phone; it stays in the list.
function AlertOverlay({
  alert,
  guardName,
  onTake,
  onClose,
}: {
  alert: SecurityAlert;
  guardName: string | null;
  onTake: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.overlayTag}>ALERT DARI WARGA</Text>
        <Text style={styles.overlayMeta}>
          {alert.unit_no ? `Rumah ${alert.unit_no} · ` : ""}
          {alertTime(alert.created_at)}
        </Text>
        <Text style={styles.overlayMessage}>{alert.message}</Text>
        {alert.photo_url && (
          <Image source={{ uri: alert.photo_url }} style={styles.photo} resizeMode="contain" />
        )}
        {guardName ? (
          <Button
            label={`Saya Tangani (${guardName})`}
            big
            busy={busy}
            onPress={async () => {
              setBusy(true);
              await onTake();
              setBusy(false);
            }}
          />
        ) : (
          <Text style={styles.overlayHint}>Masuk dengan nama & PIN untuk menangani alert ini.</Text>
        )}
        <Button label={guardName ? "Tutup" : "Tutup & Masuk"} variant="secondary" onPress={onClose} />
      </ScrollView>
    </View>
  );
}

// Active alerts (last 24 jam, not closed by pengurus), shown on the login
// and home screens.
function AlertList({
  alerts,
  hint,
  onTake,
}: {
  alerts: SecurityAlert[];
  hint?: string;
  onTake?: (alert: SecurityAlert) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (alerts.length === 0) return null;
  return (
    <View style={{ marginTop: 8, marginBottom: 8 }}>
      {alerts.map((a) => (
        <View key={a.id} style={[styles.alertCard, a.status === "acknowledged" && styles.alertCardTaken]}>
          <Text style={styles.alertCardTitle}>
            {a.status === "open" ? "🚨 Alert belum ditangani" : `✓ Ditangani ${a.acknowledged_by ?? ""}`}
          </Text>
          <Text style={styles.statusDetail}>
            {a.unit_no ? `Rumah ${a.unit_no} · ` : ""}
            {alertTime(a.created_at)}
          </Text>
          <Text style={styles.alertCardMessage}>{a.message}</Text>
          {a.photo_url && (
            <Image source={{ uri: a.photo_url }} style={styles.alertThumb} resizeMode="cover" />
          )}
          {a.status === "open" &&
            (onTake ? (
              <Button
                label="Saya Tangani"
                busy={busyId === a.id}
                onPress={async () => {
                  setBusyId(a.id);
                  await onTake(a);
                  setBusyId(null);
                }}
              />
            ) : (
              hint && <Text style={styles.statusDetail}>{hint}</Text>
            ))}
        </View>
      ))}
    </View>
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
  type,
  shift,
  onBack,
  onSubmit,
}: {
  type: CheckinType;
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
      <ShiftHeader
        title={type === "masuk" ? "Absen Masuk" : "Absen Pulang"}
        shift={shift}
        onBack={onBack}
      />
      <Text style={styles.muted}>
        {type === "masuk" ? "Di awal shift, foto diri di pos." : "Di akhir shift, foto diri di pos."}
      </Text>
      <Text style={styles.label}>Foto</Text>
      <PhotoField photo={photo} onChange={setPhoto} />
      <Button
        label={type === "masuk" ? "Kirim Absen Masuk" : "Kirim Absen Pulang"}
        big
        onPress={submit}
        busy={busy}
        disabled={!photo}
      />
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
        <ActivityIndicator color="#422006" />
      ) : (
        <Text style={[styles.buttonText, variant === "secondary" && styles.buttonTextSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fef2f2",
    zIndex: 10,
    elevation: 10,
  },
  overlayTag: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#fff",
    backgroundColor: "#dc2626",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  overlayMeta: { fontSize: 15, color: "#991b1b", marginTop: 12 },
  overlayMessage: { fontSize: 24, fontWeight: "700", color: "#111827", marginVertical: 16 },
  overlayHint: { fontSize: 15, color: "#991b1b", marginTop: 8 },
  alertCard: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  alertCardTaken: { backgroundColor: "#fffbeb", borderColor: "#fcd34d" },
  alertCardTitle: { fontSize: 16, fontWeight: "700", color: "#b91c1c" },
  alertCardMessage: { fontSize: 16, color: "#111827", marginTop: 6 },
  alertThumb: { width: "100%", height: 160, borderRadius: 6, marginTop: 8 },
  root: { flex: 1, backgroundColor: "#fffdf5" },
  page: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  logo: { width: 200, height: 137, alignSelf: "center", marginBottom: 4 },
  logoSmall: { width: 96, height: 66, marginBottom: 8 },
  appName: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#a16207",
    textAlign: "center",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "600", color: "#111827", marginBottom: 4 },
  muted: { fontSize: 14, color: "#6b7280", marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "500", color: "#374151", marginTop: 16, marginBottom: 6 },
  error: { fontSize: 14, color: "#b91c1c", marginTop: 16 },
  panel: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  panelText: { fontSize: 14, color: "#9a3412" },
  back: { fontSize: 16, color: "#a16207", fontWeight: "500", marginBottom: 12 },
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
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 16 },
  tile: {
    width: "48%",
    aspectRatio: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginBottom: 12,
  },
  tilePressed: { backgroundColor: "#fef9c3", borderColor: "#eab308" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fde047",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  avatarText: { fontSize: 24, fontWeight: "700", color: "#713f12" },
  avatarBig: { width: 80, height: 80, borderRadius: 40 },
  avatarTextBig: { fontSize: 34 },
  tileName: { fontSize: 17, fontWeight: "600", color: "#111827", textAlign: "center" },
  pinHeader: { alignItems: "center", marginTop: 16, marginBottom: 16 },
  inputError: { borderColor: "#dc2626" },
  pinError: { textAlign: "center", marginTop: 8 },
  pinInput: { fontSize: 28, textAlign: "center", letterSpacing: 12, paddingVertical: 14 },
  shiftCard: {
    backgroundColor: "#fef9c3",
    borderWidth: 1,
    borderColor: "#fde047",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  shiftLabel: { fontSize: 13, color: "#a16207", fontWeight: "500" },
  shiftName: { fontSize: 20, fontWeight: "700", color: "#111827", marginTop: 2 },
  status: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },
  statusWaiting: { backgroundColor: "#fff7ed", borderColor: "#fdba74" },
  statusRejected: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  statusTitle: { fontSize: 16, fontWeight: "600", color: "#047857" },
  statusTitleWaiting: { color: "#9a3412" },
  statusTitleRejected: { color: "#b91c1c" },
  statusDetail: { fontSize: 14, color: "#4b5563", marginTop: 2 },
  photo: { width: "100%", aspectRatio: 3 / 4, borderRadius: 8, marginBottom: 8 },
  button: {
    backgroundColor: "#facc15",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonBig: { paddingVertical: 18 },
  buttonSecondary: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7e5e4" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#422006", fontSize: 16, fontWeight: "700" },
  buttonTextSecondary: { color: "#44403c", fontWeight: "600" },
});
