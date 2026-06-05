/**
 * RecognizeScreen.tsx  (v2)
 * Live face recognition with dual-layer liveness detection.
 * Uses VisionCamera frame processor for low-latency frame capture.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Vibration,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import Geolocation from 'react-native-geolocation-service';
import FaceOverlay from '../components/FaceOverlay';
import LivenessPrompt from '../components/LivenessPrompt';
import { faceAuthService, AuthResult, AuthSession } from '../services/FaceAuthService';
import db from '../services/DatabaseService';

// ─── Types ────────────────────────────────────────────────────────────────────
type ScreenState = 'idle' | 'scanning' | 'pass' | 'fail';

const CHALLENGE_TIMEOUT = 7;

export default function RecognizeScreen() {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);

  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [challengeTimeLeft, setChallengeTimeLeft] = useState(CHALLENGE_TIMEOUT);
  const [challengeDone, setChallengeDone] = useState(false);

  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef    = useRef(false);
  const sessionRef     = useRef<AuthSession | null>(null);
  const processingRef  = useRef(false);

  // ─── Permissions ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // ─── Timer ───────────────────────────────────────────────────────────────────
  const startTimer = () => {
    setChallengeTimeLeft(CHALLENGE_TIMEOUT);
    timerRef.current = setInterval(() => {
      setChallengeTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handleTimeout = useCallback(() => {
    if (!isActiveRef.current) return;
    isActiveRef.current = false;
    setScreenState('fail');
    setAuthResult({
      status: 'CHALLENGE_TIMEOUT',
      message: 'Liveness challenge timed out. Please try again.',
    });
  }, []);

  // ─── Capture Loop ────────────────────────────────────────────────────────────
  const captureLoop = useCallback(async (sess: AuthSession) => {
    while (isActiveRef.current && camera.current) {
      if (processingRef.current) {
        await sleep(100);
        continue;
      }
      processingRef.current = true;

      try {
        const photo = await camera.current.takePhoto({
          flash: 'off',
        });

        const result = await faceAuthService.processFrame(
          photo.path,
          sess,
          () => {
            // Challenge completed!
            stopTimer();
            setChallengeDone(true);
          },
        );

        setAuthResult(result);

        if (result.status === 'PASS') {
          isActiveRef.current = false;
          setScreenState('pass');
          Vibration.vibrate([0, 100, 80, 100]);

          // Log attendance with GPS
          const loc = await getLocation();
          await db.logAttendance({
            person_id:   result.personId!,
            timestamp:   Date.now(),
            confidence:  result.similarity ?? 0,
            liveness_ok: 1,
            lat:         loc?.latitude  ?? null,
            lon:         loc?.longitude ?? null,
          });

          // Auto-restart after 3 seconds
          setTimeout(startScanning, 3000);
          break;
        }

        if (result.status === 'SPOOF' || result.status === 'NOT_ENROLLED') {
          isActiveRef.current = false;
          setScreenState('fail');
          break;
        }
      } catch (err) {
        console.warn('[Recognize] frame error:', err);
      } finally {
        processingRef.current = false;
      }

      await sleep(150);
    }
  }, []); // eslint-disable-line

  const startScanning = useCallback(() => {
    const sess = faceAuthService.createSession();
    setSession(sess);
    sessionRef.current = sess;
    setAuthResult(null);
    setChallengeDone(false);
    setScreenState('scanning');
    isActiveRef.current = true;
    processingRef.current = false;
    startTimer();
    captureLoop(sess);
  }, [captureLoop]); // eslint-disable-line

  const stopScanning = () => {
    isActiveRef.current = false;
    stopTimer();
    setScreenState('idle');
    setSession(null);
    setAuthResult(null);
  };

  useEffect(() => () => { isActiveRef.current = false; stopTimer(); }, []);

  // ─── Derived overlay state ────────────────────────────────────────────────
  const overlayStatus =
    screenState === 'idle'    ? 'idle'      :
    screenState === 'pass'    ? 'pass'      :
    screenState === 'fail'    ? 'fail'      :
    authResult?.status === 'SPOOF' ? 'spoof' :
    challengeDone             ? 'liveness'  : 'challenge';

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permText}>📷 Camera permission needed</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permText}>No front camera found</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera Preview */}
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={screenState === 'scanning'}
        photo
        pixelFormat="yuv"
      />

      {/* Animated face overlay */}
      <FaceOverlay
        status={overlayStatus}
        challenge={session?.challenge}
        challengeTimeLeft={screenState === 'scanning' ? challengeTimeLeft : undefined}
        personName={authResult?.personName}
        similarity={authResult?.similarity}
        livenessScore={authResult?.livenessScore}
        message={authResult?.message}
      />

      {/* Liveness prompt card */}
      {screenState === 'scanning' && session?.challenge && (
        <View style={styles.promptContainer}>
          <LivenessPrompt
            challenge={session.challenge}
            timeLeft={challengeTimeLeft}
            totalTime={CHALLENGE_TIMEOUT}
            completed={challengeDone}
          />
        </View>
      )}

      {/* Control button */}
      <SafeAreaView style={styles.controls} edges={['bottom']}>
        {screenState === 'idle' || screenState === 'fail' ? (
          <TouchableOpacity style={[styles.scanBtn, { backgroundColor: '#00BCD4' }]} onPress={startScanning}>
            <Text style={styles.scanBtnText}>
              {screenState === 'fail' ? '🔄 Try Again' : '▶ Start Scan'}
            </Text>
          </TouchableOpacity>
        ) : screenState === 'scanning' ? (
          <TouchableOpacity style={[styles.scanBtn, { backgroundColor: '#F44336' }]} onPress={stopScanning}>
            <Text style={styles.scanBtnText}>⏹ Stop</Text>
          </TouchableOpacity>
        ) : screenState === 'pass' ? (
          <View style={[styles.scanBtn, { backgroundColor: '#4CAF5066' }]}>
            <Text style={styles.scanBtnText}>✅ Attendance Logged — Restarting...</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const getLocation = (): Promise<{ latitude: number; longitude: number } | null> =>
  new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      ()  => resolve(null),
      { timeout: 3000, maximumAge: 60000 },
    );
  });

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#000' },
  center:     { flex: 1, backgroundColor: '#0D1117', justifyContent: 'center', alignItems: 'center', gap: 20 },
  permText:   { color: '#FFFFFF', fontSize: 18, fontFamily: 'Roboto-Regular' },
  btn:        { backgroundColor: '#00BCD4', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  btnText:    { color: '#FFFFFF', fontFamily: 'Roboto-Bold', fontSize: 16 },
  promptContainer: {
    position: 'absolute',
    bottom: 130,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  controls: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 20,
    paddingBottom: 28,
  },
  scanBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Roboto-Bold',
    fontSize: 18,
    letterSpacing: 0.3,
  },
});
